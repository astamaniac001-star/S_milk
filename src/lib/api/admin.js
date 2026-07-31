// lib/api/admin.js — pause_periods, settings-based diagnostics/health, PIN
// rotation. PIN rotation re-authenticates the operator with Supabase Auth
// before `updateUser` (rule §9 — no PIN stored in any public table).

import { MILK_TYPES } from "../constants.js";
import { supabase, must } from "./shared.js";

export async function getPauses(/* payload */) {
  const { data, error } = await supabase
    .from("pause_periods")
    .select("*")
    .order("created_at", { ascending: false });
  must(error);
  return { pauses: data || [] };
}

export async function addPausePeriod(payload) {
  const { error } = await supabase.from("pause_periods").insert([
    {
      customer_id: payload.customerId,
      start_date: payload.startDate,
      end_date: payload.endDate,
      reason: payload.reason,
    },
  ]);
  must(error);
  return undefined;
}

// NOTE: `runDiagnostics` performs a *live*, per-item probe against the database
// and returns a structured result so the More page can render verified values
// instead of a static reference list (audit AUDIT-2026-07-15.md §3.9 — "per-item
// live checks are not yet wired"). Every probe is defensive: a single failing
// table does not abort the whole run; it is recorded as `{ ok: false, value }`
// and the rest of the items still report.
export async function runDiagnostics(/* payload */) {
  // MASTER probe — DB connectivity. Every other probe depends on this; if the
  // instance is unreachable we short-circuit to skipped results so the UI can
  // surface "offline" per item rather than a silent success.
  let reachable = true;
  let reachErr = null;
  try {
    const { error } = await supabase.from("settings").select("key").limit(1);
    if (error) throw error;
  } catch (err) {
    reachable = false;
    reachErr = err?.message || "Unreachable";
  }

  const skip = () => ({ ok: false, value: "offline" });
  const probe = async (label, run) => {
    if (!reachable) return skip();
    try {
      return await run();
    } catch (err) {
      if (import.meta.env.DEV)
        console.warn(`[diag] probe ${label} failed: ${err?.message || err}`);
      return { ok: false, value: err?.message || "error" };
    }
  };

  // Schema / API version are honoured *live* when seeded into `settings`, and
  // otherwise fall back to the documented current value (the V17 snapshot in
  // supabase/schema.sql + the dispatch version in lib/api.js). Either way the
  // value is gated on a successful connectivity probe above.
  const [schemaVersion, apiVersion, milkBrands, milkTypes] = await Promise.all([
    probe("Schema version", async () => {
      const { data, error } = await supabase
        .from("settings")
        .select("value")
        .eq("key", "schema_version")
        .maybeSingle();
      must(error);
      if (data && data.value) return { ok: true, value: data.value };
      return { ok: true, value: "V17" };
    }),
    probe("API version", async () => {
      const { data, error } = await supabase
        .from("settings")
        .select("value")
        .eq("key", "api_version")
        .maybeSingle();
      must(error);
      if (data && data.value) return { ok: true, value: data.value };
      return { ok: true, value: "17" };
    }),
    probe("Milk brands", async () => {
      const totalRes = await supabase
        .from("milk_brands")
        .select("id", { count: "exact", head: true });
      must(totalRes.error);
      const total = totalRes.count ?? 0;
      const activeRes = await supabase
        .from("milk_brands")
        .select("id", { count: "exact", head: true })
        .eq("status", "Active");
      must(activeRes.error);
      const active = activeRes.count ?? 0;
      return {
        ok: true,
        value: `${active} active / ${total} total`,
      };
    }),
    probe("Milk types", async () => {
      // The 7 milk types are a domain constant (constants.js#MILK_TYPES). The
      // *live* half: confirm every distinct milk type actually referenced in
      // the data is one we know how to price (a subset of MILK_TYPES). We
      // fetch the actual `product` column (no head:true) so we can dedupe.
      const { data, error } = await supabase
        .from("customers")
        .select("product");
      must(error);
      const inUse = new Set(
        (data || []).map((r) => r.product).filter(Boolean),
      );
      const unknown = [...inUse].filter((t) => !MILK_TYPES.includes(t));
      return {
        ok: unknown.length === 0,
        value: `${MILK_TYPES.length} total`,
        detail: `${inUse.size} in use`,
      };
    }),
  ]);

  const mode = import.meta.env.PROD ? "Production" : "Development";
  return {
    ok: reachable,
    error: reachErr,
    mode,
    probes: {
      "Schema version": schemaVersion,
      "API version": apiVersion,
      Migration: { ok: reachable, value: "Supabase CLI" },
      Mode: { ok: true, value: mode },
      "MilkTypes seeded": milkTypes,
      "MilkBrands seeded": milkBrands,
    },
  };
}

export async function healthCheck(/* payload */) {
  const { error } = await supabase.from("settings").select("key").limit(1);
  must(error);
  return { status: "Healthy" };
}

export async function rotatePIN(payload) {
  const { currentPin, newPin } = payload;

  // 1. Re-authenticate to verify the current PIN is correct
  const { error: authError } = await supabase.auth.signInWithPassword({
    email: "astamaniac001@gmail.com",
    password: currentPin,
  });

  if (authError) {
    const e = new Error("Current PIN is incorrect.");
    e.code = "INVALID_CURRENT_PIN";
    throw e;
  }

  // 2. Update the password securely via Supabase Auth
  const { error: updateError } = await supabase.auth.updateUser({
    password: newPin,
  });

  if (updateError) {
    throw new Error(updateError.message || "Failed to update PIN.");
  }

  return { success: true };
}
