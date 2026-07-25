// lib/api/subscriptions.js — active-subscription billing rollover + CRUD +
// (synthesized) history. Rollover is delegated to a single transactional RPC
// (`rollover_month_rpc`) per rule §14.

import { supabase, toNum, updateWithVersion, must, AuthzError } from "./shared.js";

export async function rolloverMonth(payload) {
  const { targetMonth } = payload; // YYYY-MM
  if (!targetMonth) throw new Error("targetMonth is required");
  // Reject both shape and month-range: `^\d{4}-\d{2}$` alone permits
  // invalid values like "2024-13", so validate the 1..12 range separately.
  const m = /^(\d{4})-(\d{2})$/.exec(targetMonth);
  if (!m) throw new Error("targetMonth must be YYYY-MM");
  const monthNum = Number(m[2]);
  if (monthNum < 1 || monthNum > 12)
    throw new Error("targetMonth must be YYYY-MM");

  // Atomic RPC: INSERT ON CONFLICT DO NOTHING for every active subscription
  // (rule §14 — multi-write money/read ops must be one transaction).
  const { data: rpcResult, error: rpcError } = await supabase.rpc(
    "rollover_month_rpc",
    { p_month: targetMonth },
  );
  if (rpcError) {
    if (rpcError.message.includes("Unauthorized")) {
      throw new AuthzError(rpcError.message);
    }
    throw rpcError;
  }
  return rpcResult || {
    billsGenerated: 0,
    skippedExisting: 0,
    activeSubscriptions: 0,
  };
}

export async function getSubscriptions(/* payload */) {
  const { data, error } = await supabase.from("subscriptions").select("*");
  must(error);
  return { subscriptions: data || [] };
}

export async function saveSubscription(payload) {
  if (payload.id) {
    const data = await updateWithVersion(
      "subscriptions",
      payload.id,
      payload.expectedVersion ?? payload.version,
      {
        milk_type: payload.milkType,
        qty: toNum(payload.qty),
        delivery_days: JSON.stringify(payload.deliveryDays),
        is_active: payload.isActive,
      },
    );
    return { subscriptionId: data.id, newVersion: data.version };
  }
  const { data, error } = await supabase
    .from("subscriptions")
    .insert([
      {
        customer_id: payload.customerId,
        milk_type: payload.milkType,
        qty: toNum(payload.qty),
        delivery_days: JSON.stringify(payload.deliveryDays),
        is_active: payload.isActive !== undefined ? payload.isActive : true,
      },
    ])
    .select()
    .single();
  must(error);
  return { subscriptionId: data.id };
}

// NOTE: Real audit history is not stored — this synthesizes up to two entries
// from created_at/updated_at on the row itself. Documented as a stub; not on
// the audit hit list.
export async function getSubscriptionHistory(payload) {
  const { subscriptionId } = payload;
  if (!subscriptionId) throw new Error("subscriptionId is required");
  const { data: sub, error } = await supabase
    .from("subscriptions")
    .select("*")
    .eq("id", subscriptionId)
    .maybeSingle();
  must(error);
  const history = [];
  if (sub?.created_at) {
    history.push({
      id: `${sub.id}-created`,
      action: "CREATED",
      details: `${sub.milk_type || "Subscription"} · ${toNum(sub.qty)}L`,
      timestamp: sub.created_at,
    });
  }
  if (sub?.updated_at && sub.updated_at !== sub.created_at) {
    history.push({
      id: `${sub.id}-updated`,
      action: "UPDATED",
      details: `Now ${sub.milk_type || ""} · ${toNum(sub.qty)}L · v${sub.version || 1}`,
      timestamp: sub.updated_at,
    });
  }
  return { history };
}
