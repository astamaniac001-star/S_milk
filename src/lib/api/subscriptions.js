// lib/api/subscriptions.js — active-subscription billing rollover + CRUD +
// (synthesized) history. Rollover is delegated to a single transactional RPC
// (`rollover_month_rpc`) per rule §14.

import {
  supabase,
  toNum,
  updateWithVersion,
  must,
  AuthzError,
} from "./shared.js";

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
  return (
    rpcResult || {
      billsGenerated: 0,
      skippedExisting: 0,
      activeSubscriptions: 0,
    }
  );
}

export async function getSubscriptions(/* payload */) {
  const { data, error } = await supabase.from("subscriptions").select("*");
  must(error);
  return { subscriptions: data || [] };
}

export async function saveSubscription(payload) {
  // Validate at the API boundary — the DB has no CHECK on qty and a missing
  // customer_id would create an orphan subscription (column is nullable).
  if (!payload.id && !payload.customerId) {
    throw new Error("customerId is required");
  }
  const qty = toNum(payload.qty);
  if (!(qty > 0)) throw new Error("Quantity must be greater than 0");

  // Friendly surface for the DB's partial unique index
  // uniq_sub_customer_brand_type_active (one active sub per customer +
  // brand + milk type; a different brand of the same type IS allowed).
  const friendlyUnique = (err) => {
    if (err?.code === "23505") {
      throw new Error(
        "This customer already has an active subscription for this brand and milk type",
      );
    }
    throw err;
  };

  if (payload.id) {
    let data;
    try {
      data = await updateWithVersion(
        "subscriptions",
        payload.id,
        payload.expectedVersion ?? payload.version,
        {
          brand_id: payload.brandId || null,
          milk_type: payload.milkType,
          qty,
          delivery_days: JSON.stringify(payload.deliveryDays),
          is_active: payload.isActive,
        },
      );
    } catch (err) {
      friendlyUnique(err);
    }
    return { subscriptionId: data.id, newVersion: data.version };
  }
  const { data, error } = await supabase
    .from("subscriptions")
    .insert([
      {
        customer_id: payload.customerId,
        brand_id: payload.brandId || null,
        milk_type: payload.milkType || "Full Cream",
        qty,
        delivery_days: JSON.stringify(payload.deliveryDays),
        is_active: payload.isActive !== undefined ? payload.isActive : true,
      },
    ])
    .select()
    .single();
  if (error) friendlyUnique(error);
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

// OCC delete: a Supabase mutation can return no error while matching zero rows,
// so a successful HTTP response alone is not proof the row was deleted
// (rule §5). Compare-and-set on `version`, then assert exactly one row was
// affected by reading the (post-delete) count beforehand. We use the count
// header on the delete itself so we don't need a separate round-trip.
export async function deleteSubscription(payload) {
  const { subscriptionId, version } = payload;
  if (!subscriptionId) throw new Error("subscriptionId is required");
  if (version === undefined || version === null)
    throw new Error("subscription version is required for OCC");

  // FIX (2026-11-21 audit): same version-0 preservation as
  // updateWithVersion — `toNum(version) || 1` rewrote a legitimate
  // version = 0 to 1, producing a spurious CONFLICT on a valid delete.
  const ev = toNum(version);
  let count;
  let error;
  try {
    const res = await supabase
      .from("subscriptions")
      .delete({ count: "exact" })
      .eq("id", subscriptionId)
      .eq("version", ev);
    error = res.error;
    count = res.count;
  } catch (err) {
    throw err instanceof Error ? err : new Error(err?.message || String(err));
  }
  must(error);
  if (typeof count !== "number") {
    // Some Supabase versions don't populate `count` without `Prefer: count=exact`.
    // Fall back to a verification select — if the row still exists, the version
    // must have moved (concurrent edit) and we surface a CONFLICT.
    const { data: still, error: selErr } = await supabase
      .from("subscriptions")
      .select("id")
      .eq("id", subscriptionId)
      .maybeSingle();
    must(selErr);
    if (still) {
      const conflict = new Error(
        "This subscription was changed elsewhere. Please refresh and try again.",
      );
      conflict.code = "CONFLICT";
      throw conflict;
    }
    count = 1;
  }
  if (count !== 1) {
    const conflict = new Error(
      "This subscription was changed elsewhere. Please refresh and try again.",
    );
    conflict.code = "CONFLICT";
    throw conflict;
  }
  return { subscriptionId, deleted: true };
}
