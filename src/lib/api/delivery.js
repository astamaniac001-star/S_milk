// lib/api/delivery.js — daily_logs queries and mutations. Log generation
// (`generateDailyLogsForDate`) deliberately runs 4 parallel queries and a
// client-side filter before a single upsert — see AGENTS.md note: do not
// refactor to a sequential loop.

import { supabase, toNum, getToday, getDaysAgoIST, must, toArray, dayOfWeekKolkata, AuthzError } from "./shared.js";
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
  // Rows WITHOUT a brand (legacy/unbranded) must not go through the upsert:
  // NULL never matches in a unique index, so the upsert would INSERT a
  // duplicate row instead of updating (and the DB's NULL-safe unique index
  // would reject it with a 409). Those rows are updated by id — or inserted
  // when no brandless row exists yet for that (customer, date, product).
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

  for (const row of brandlessRows) {
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
    } else {
      const { error: insertError } = await supabase
        .from("daily_logs")
        .insert([row]);
      must(insertError);
    }
    saved += 1;
  }

  if (saved !== rows.length) {
    console.warn(`bulkUpsertLogs count mismatch: expected ${rows.length}, got ${saved}`);
  }
  return { saved };
}

export async function generateDailyLogsForDate(payload) {
  const { date } = payload;
  if (!date) throw new Error("date is required");

  const dow = dayOfWeekKolkata(date);

  const [custRes, subRes, pauseRes, logRes] = await Promise.all([
    supabase
      .from("customers")
      .select("id, status"),
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
  const subsByCustomer = new Map();
  for (const s of subRes.data || []) {
    // Multiple subscriptions per customer are supported — same milk type
    // from DIFFERENT brands is expected (each becomes its own daily_logs row
    // so billing can price it at that brand's rate). The DB partial unique
    // index uniq_sub_customer_brand_type_active guarantees at most one
    // active sub per (customer, brand, milk_type), so same-key subs below
    // are merged by SUMMING qty and never collide with the
    // (customer_id, date, brand_id, product) constraint.
    if (!subsByCustomer.has(s.customer_id))
      subsByCustomer.set(s.customer_id, []);
    subsByCustomer.get(s.customer_id).push(s);
  }
  const paused = new Set(
    (pauseRes.data || [])
      .filter(
        (p) => p.start_date <= date && (!p.end_date || p.end_date >= date),
      )
      .map((p) => p.customer_id),
  );

  let created = 0,
    skippedExisting = 0,
    skippedPaused = 0,
    skippedWrongDay = 0,
    skippedInactiveCust = 0;
  const toInsert = [];

  // Subscription-centric: logs are generated from active subscriptions only.
  // The legacy customer-default fallback (customers.delivery_days/daily_qty/
  // product) is gone — a customer with no active subscription simply has no
  // scheduled delivery.
  for (const [custId, subs] of subsByCustomer) {
    if (!activeCustomerIds.has(custId)) {
      skippedInactiveCust++;
      continue;
    }
    if (paused.has(custId)) {
      skippedPaused++;
      continue;
    }

    // Merge same-day quantities per (brand, product) into one row per key —
    // the daily_logs row identity is customer+date+brand+product. Two
    // different brands of the same milk type become two rows (correct: each
    // is priced at its own brand's rate).
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
    if (qtyByProductKey.size === 0) {
      skippedWrongDay++;
      continue;
    }

    for (const { brandId, product, qty } of qtyByProductKey.values()) {
      if (existing.has(`${custId}|${brandId}|${product}`)) {
        skippedExisting++;
        continue;
      }
      toInsert.push({
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

  if (toInsert.length) {
    // count in upsert options — see bulkUpsertLogs above.
    const { count, error } = await supabase
      .from("daily_logs")
      .upsert(toInsert, {
        onConflict: "customer_id,date,brand_id,product",
        count: "exact",
      });
    must(error);
    const savedCount = Number(count) || 0;
    if (savedCount !== toInsert.length) {
      console.warn(`generateDailyLogsForDate upsert count mismatch: expected ${toInsert.length}, got ${savedCount}`);
    }
    created = savedCount;
  }
  return {
    created,
    skippedExisting,
    skippedPaused,
    skippedWrongDay,
    skippedInactiveCust,
  };
}

export async function addAdHocLog(payload) {
  const { customerId, date, qty, reason, product, brandId } = payload;
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
  const { data: rpcResult, error: rpcError } = await supabase.rpc(
    "record_ad_hoc_log_rpc",
    {
      p_customer_id: customerId,
      p_date: date,
      p_qty: addQty,
      p_product: product || "",
      p_brand_id: brandId || null,
      p_reason: reason || "",
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
  };
}
