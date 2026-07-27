// lib/api/admin.js — pause_periods, settings-based diagnostics/health, PIN
// rotation. PIN rotation re-authenticates the operator with Supabase Auth
// before `updateUser` (rule §9 — no PIN stored in any public table).

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

// NOTE: `runDiagnostics` and `healthCheck` are intentionally identical probes
// (settings SELECT limit 1). They surface as two distinct UI affordances on
// the More page — diagnostics tracks `diagRan` to flip a badge; health is a
// standalone reassurance. The duplication is documented; do not collapse into
// one without updating useAdminHandlers.
export async function runDiagnostics(/* payload */) {
  const { error } = await supabase.from("settings").select("key").limit(1);
  must(error);
  return { status: "OK" };
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
