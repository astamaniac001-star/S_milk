// lib/api/delivery.js — daily_logs queries and mutations. Log generation
// (`generateDailyLogsForDate`) deliberately runs 4 parallel queries and a
// client-side filter before a single upsert — see AGENTS.md note: do not
// refactor to a sequential loop.

import {
  supabase,
  toNum,
  getToday,
  getDaysAgoIST,
  must,
  toArray,
  dayOfWeekKolkata,
  AuthzError,
} from "./shared.js";
import { mapLogFromApi } from "./mappers.js";

export async function getDailyLogs(payload) {
  let q = supabase.from("daily_logs").select("*");
  if (payload.date) {
    q = q.eq("date", payload.date);
  } else {
    // CRITICAL FIX: default to last 30 days to prevent unbounded fetch.
    const endDate = getToday();
    const startDate = getDaysAgoIST(30);
    q = q.gte("date", startDate).lte("date", endDate);
  }
  const { data, error } = await q.order("date", { ascending: false });
  must(error);
  return { logs: data || [] };
}

export async function updateLogEntry(payload) {
  const { logId, delivered, qty, note } = payload;
  const patch = { delivered };
  if (qty !== undefined) patch.qty = qty;
  if (note !== undefined) patch.note = note;
  const { data, error } = await supabase
    .from("daily_logs")
    .update(patch)
    .eq("id", logId)
    .select()
    .single();
  if (error) throw error;
  return { data: mapLogFromApi(data) };
}

// Rows WITHOUT a brand (legacy/unbranded) must not go through the PostgREST
// upsert: NULL never matches in a unique index, so the upsert would INSERT a
// duplicate row instead of updating (and the DB's NULL-safe unique expression
// index would reject it with a 409). Each row is found by
// (customer_id, date, product) and updated by id — or inserted when no
// brandless row exists yet. Shared by bulkUpsertLogs and
// generateDailyLogsForDate so the two write paths cannot drift.
async function upsertBrandlessRow(row) {
  const { data: existing, error: findError } = await supabase
    .from("daily_logs")
    .select("id")
    .eq("customer_id", row.customer_id)
    .eq("date", row.date)
    .eq("product", row.product)
    .is("brand_id", null)
    .limit(1);
  must(findError);
  const match = (existing || [])[0];
  if (match) {
    const { error: updateError } = await supabase
      .from("daily_logs")
      .update({ qty: row.qty, delivered: row.delivered, note: row.note })
      .eq("id", match.id);
    must(updateError);
    return;
  }
  const { error: insertError } = await supabase
    .from("daily_logs")
    .insert([row]);
  must(insertError);
}

async function upsertBrandlessRows(rows) {
  for (const row of rows) {
    await upsertBrandlessRow(row);
  }
}

export async function bulkUpsertLogs(payload) {
  if (!Array.isArray(payload.logs) || payload.logs.length === 0) {
    return { saved: 0 };
  }
  const rows = payload.logs.map((l) => ({
    // UI-shaped logs use `custId` (mapLogFromApi); accept both spellings so a
    // wired-up caller can't silently insert orphan rows with a NULL
    // customer_id (daily_logs.customer_id is nullable).
    customer_id: l.customerId ?? l.custId,
    date: l.date,
    product: l.product || "Full Cream",
    // Brand-aware identity: null only for legacy/unbranded rows.
    brand_id: l.brandId ?? l.brand_id ?? null,
    qty: toNum(l.qty),
    delivered: !!l.delivered,
    note: l.note || "",
  }));
  // count MUST go in the upsert options: the transform-builder `.select()`
  // (used after POST/PATCH) accepts only a columns string — a second
  // `{count, head}` argument is silently dropped, so `count` stays null.
  // onConflict must match the DB identity (customer_id, date, brand_id,
  // product) — a customer can receive several milk types and several brands
  // of the same type on the same day.
  //
  // Rows WITHOUT a brand go through the find-then-update-or-insert path
  // (upsertBrandlessRows) — see that helper for why.
  const brandedRows = rows.filter((r) => r.brand_id);
  const brandlessRows = rows.filter((r) => !r.brand_id);

  let saved = 0;

  if (brandedRows.length) {
    const { count, error } = await supabase
      .from("daily_logs")
      .upsert(brandedRows, {
        onConflict: "customer_id,date,brand_id,product",
        count: "exact",
      });
    must(error);
    saved += Number(count) || 0;
  }

  await upsertBrandlessRows(brandlessRows);
  saved += brandlessRows.length;

  if (saved !== rows.length) {
    console.warn(
      `bulkUpsertLogs count mismatch: expected ${rows.length}, got ${saved}`,
    );
  }
  return { saved };
}

// Merge one customer's subscriptions that fall on `dow` into one quantity per
// (brand, product) key. Same-type subs from different brands stay separate so
// each bills at its own rate; same (brand, type) subs SUM (the DB's
// uniq_sub_customer_brand_type_active index guarantees at most one active
// row per key, so summing is the merge the generator expects).
function mergeSameDayQtyByProduct(subs, dow) {
  const qtyByProductKey = new Map();
  for (const s of subs) {
    if (!toArray(s.delivery_days).map(Number).includes(dow)) continue;
    const product = s.milk_type || "Full Cream";
    const brandId = s.brand_id ?? "";
    const key = `${brandId}|${product}`;
    const entry = qtyByProductKey.get(key) || { brandId, product, qty: 0 };
    entry.qty += toNum(s.qty || 0);
    qtyByProductKey.set(key, entry);
  }
  return qtyByProductKey;
}

// Pure scheduling rules: which daily_logs rows does this date need? Extracted
// from generateDailyLogsForDate so the rules are unit-testable without
// Supabase mocks. Returns the rows to write plus the skip counters the
// Generate button's summary reports. No I/O, no mutation of its inputs.
export function buildDailyLogRows({
  date,
  dow,
  subscriptions,
  activeCustomerIds,
  pausedCustomerIds,
  existingKeys,
}) {
  const subsByCustomer = new Map();
  for (const s of subscriptions || []) {
    if (!subsByCustomer.has(s.customer_id))
      subsByCustomer.set(s.customer_id, []);
    subsByCustomer.get(s.customer_id).push(s);
  }

  const counters = {
    skippedExisting: 0,
    skippedPaused: 0,
    skippedWrongDay: 0,
    skippedInactiveCust: 0,
  };
  const rows = [];

  // Subscription-centric: logs are generated from active subscriptions only.
  // The legacy customer-default fallback (customers.delivery_days/daily_qty/
  // product) is gone — a customer with no active subscription simply has no
  // scheduled delivery.
  for (const [custId, subs] of subsByCustomer) {
    if (!activeCustomerIds.has(custId)) {
      counters.skippedInactiveCust++;
      continue;
    }
    if (pausedCustomerIds.has(custId)) {
      counters.skippedPaused++;
      continue;
    }

    const qtyByProductKey = mergeSameDayQtyByProduct(subs, dow);
    if (qtyByProductKey.size === 0) {
      counters.skippedWrongDay++;
      continue;
    }

    for (const { brandId, product, qty } of qtyByProductKey.values()) {
      if (existingKeys.has(`${custId}|${brandId}|${product}`)) {
        counters.skippedExisting++;
        continue;
      }
      rows.push({
        customer_id: custId,
        date,
        product,
        brand_id: brandId || null,
        qty,
        delivered: false,
        note: "Auto-generated (Sub)",
      });
    }
  }

  return { rows, counters };
}

export async function generateDailyLogsForDate(payload) {
  const { date } = payload;
  if (!date) throw new Error("date is required");

  const dow = dayOfWeekKolkata(date);

  const [custRes, subRes, pauseRes, logRes] = await Promise.all([
    supabase.from("customers").select("id, status"),
    supabase
      .from("subscriptions")
      .select("customer_id, delivery_days, qty, milk_type, brand_id")
      .eq("is_active", true),
    supabase.from("pause_periods").select("customer_id, start_date, end_date"),
    supabase
      .from("daily_logs")
      .select("customer_id, product, brand_id")
      .eq("date", date),
  ]);
  must(custRes.error);
  must(subRes.error);
  must(pauseRes.error);
  must(logRes.error);

  // Row identity is (customer_id, date, brand_id, product) — a customer may
  // already have some (product, brand) rows for the date without blocking
  // the others. Legacy unbranded rows carry brand_id null (keyed as "").
  const existing = new Set(
    (logRes.data || []).map(
      (l) => `${l.customer_id}|${l.brand_id ?? ""}|${l.product}`,
    ),
  );
  const activeCustomerIds = new Set(
    (custRes.data || []).filter((c) => c.status === "Active").map((c) => c.id),
  );
  const pausedCustomerIds = new Set(
    (pauseRes.data || [])
      .filter(
        (p) => p.start_date <= date && (!p.end_date || p.end_date >= date),
      )
      .map((p) => p.customer_id),
  );

  // Pure scheduling rules — see buildDailyLogRows above.
  const { rows: toInsert, counters } = buildDailyLogRows({
    date,
    dow,
    subscriptions: subRes.data,
    activeCustomerIds,
    pausedCustomerIds,
    existingKeys: existing,
  });

  let created = 0;

  if (toInsert.length) {
    // FIX (2026-11-21 audit — AI-L M5): split brandless rows out of the
    // branded upsert, exactly like bulkUpsertLogs above. NULL never matches
    // a unique index in PostgREST onConflict inference, so a brandless row
    // sent through the upsert INSERTS a duplicate instead of updating — and
    // the DB's NULL-safe expression index then rejects it with a 409 (e.g.
    // re-generating a day that already has legacy brandless rows, or racing
    // an ad-hoc). Brandless rows are found-then-updated-or-inserted by id.
    const brandedRows = toInsert.filter((r) => r.brand_id);
    const brandlessRows = toInsert.filter((r) => !r.brand_id);

    if (brandedRows.length) {
      // count in upsert options — see bulkUpsertLogs above.
      const { count, error } = await supabase
        .from("daily_logs")
        .upsert(brandedRows, {
          onConflict: "customer_id,date,brand_id,product",
          count: "exact",
        });
      must(error);
      const savedCount = Number(count) || 0;
      if (savedCount !== brandedRows.length) {
        console.warn(
          `generateDailyLogsForDate upsert count mismatch: expected ${brandedRows.length}, got ${savedCount}`,
        );
      }
      created += savedCount;
    }

    await upsertBrandlessRows(brandlessRows);
    created += brandlessRows.length;
  }
  return { created, ...counters };
}

export async function addAdHocLog(payload) {
  const { customerId, date, qty, reason, product, brandId, clientKey } =
    payload;
  if (!customerId || !date) throw new Error("customerId and date are required");
  const addQty = toNum(qty);
  if (!(addQty > 0)) throw new Error("qty must be > 0");

  // FIX (audit 2026-07-25, rule §14): replaced the client-side
  // select-then-update-or-insert with a single transactional SECURITY DEFINER
  // RPC `record_ad_hoc_log_rpc`. The previous flow had two correctness gaps:
  //   1. Lost update — two parallel "Add Extra" calls both read qty=N,
  //      both write qty=N+add instead of N+2*add (the unique constraint only
  //      guards the insert-insert race, not the read-modify-write race).
  //   2. Two-step error surface — the SELECT and the UPDATE/INSERT could
  //      fail independently, leaving the moment partially recorded.
  // The RPC serializes the operation under SELECT ... FOR UPDATE inside a
  // single transaction; the unique (customer_id, date, brand_id, product)
  // constraint backs the INSERT branch. A concurrent insert surfaces as a
  // typed CONFLICT error so the client may retry (the retry then accumulates
  // onto the winner). Brand-aware since 2026-11: an extra delivery records
  // the brand actually supplied (e.g. a substitute during shortage) so it
  // bills at that brand's rate.
  // 2026-11-21 audit (AI-S M4): the RPC accepts an optional p_client_key —
  // an accumulating write with no dedupe token double-counted liters on a
  // network retry. The caller mints the key per submit ATTEMPT and reuses it
  // on retry of the same submit (same lifecycle as the payment key, rule §14).
  const { data: rpcResult, error: rpcError } = await supabase.rpc(
    "record_ad_hoc_log_rpc",
    {
      p_customer_id: customerId,
      p_date: date,
      p_qty: addQty,
      p_product: product || "",
      p_brand_id: brandId || null,
      p_reason: reason || "",
      ...(clientKey ? { p_client_key: clientKey } : {}),
    },
  );

  if (rpcError) {
    if (rpcError.message.includes("Unauthorized")) {
      throw new AuthzError(rpcError.message);
    }
    if (rpcError.message.includes("CONFLICT")) {
      const e = new Error(
        "This log was just updated by another action. Please retry.",
      );
      e.code = "CONFLICT";
      throw e;
    }
    if (rpcError.message.includes("BAD_REQUEST")) {
      throw new Error(rpcError.message.replace(/^BAD_REQUEST:\s*/, ""));
    }
    throw rpcError;
  }

  return {
    logId: rpcResult?.logId,
    qty: rpcResult?.qty,
    created: !!rpcResult?.created,
    idempotent: !!rpcResult?.idempotent,
  };
}
