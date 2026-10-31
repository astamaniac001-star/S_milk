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
    qty: toNum(l.qty),
    delivered: !!l.delivered,
    note: l.note || "",
  }));
  // count MUST go in the upsert options: the transform-builder `.select()`
  // (used after POST/PATCH) accepts only a columns string — a second
  // `{count, head}` argument is silently dropped, so `count` stays null.
  const { count, error } = await supabase
    .from("daily_logs")
    .upsert(rows, { onConflict: "customer_id,date", count: "exact" });
  must(error);
  const saved = Number(count) || 0;
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
      .select("id, status, delivery_days, daily_qty, product"),
    supabase
      .from("subscriptions")
      .select("customer_id, delivery_days, qty, milk_type")
      .eq("is_active", true),
    supabase.from("pause_periods").select("customer_id, start_date, end_date"),
    supabase.from("daily_logs").select("customer_id").eq("date", date),
  ]);
  must(custRes.error);
  must(subRes.error);
  must(pauseRes.error);
  must(logRes.error);

  const existing = new Set((logRes.data || []).map((l) => l.customer_id));
  const subsByCustomer = new Map();
  for (const s of subRes.data || []) {
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

  for (const c of custRes.data || []) {
    if (existing.has(c.id)) {
      skippedExisting++;
      continue;
    }
    if (c.status !== "Active") {
      skippedInactiveCust++;
      continue;
    }
    const subMatch = (subsByCustomer.get(c.id) || []).find((s) =>
      toArray(s.delivery_days).map(Number).includes(dow),
    );
    const custMatch =
      !subMatch && toArray(c.delivery_days).map(Number).includes(dow) ? c : null;
    if (!subMatch && !custMatch) {
      skippedWrongDay++;
      continue;
    }
    if (paused.has(c.id)) {
      skippedPaused++;
      continue;
    }
    const source = subMatch || custMatch;
    toInsert.push({
      customer_id: c.id,
      date,
      product: source.milk_type || source.product || "Full Cream",
      qty: toNum(source.qty || source.daily_qty || 1),
      delivered: false,
      note: subMatch
        ? "Auto-generated (Sub)"
        : "Auto-generated (Customer Default)",
    });
  }

  if (toInsert.length) {
    // count in upsert options — see bulkUpsertLogs above.
    const { count, error } = await supabase
      .from("daily_logs")
      .upsert(toInsert, { onConflict: "customer_id,date", count: "exact" });
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
  const { customerId, date, qty, reason, product } = payload;
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
  // single transaction; the unique (customer_id, date) constraint backs the
  // INSERT branch. A concurrent insert surfaces as a typed CONFLICT error
  // so the client may retry (the retry then accumulates onto the winner).
  const { data: rpcResult, error: rpcError } = await supabase.rpc(
    "record_ad_hoc_log_rpc",
    {
      p_customer_id: customerId,
      p_date: date,
      p_qty: addQty,
      p_product: product || "",
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
