// lib/api/adjustments.js — adjustments + credit notes. Both apply* mutations
// delegate to single-transaction SECURITY DEFINER RPCs (rule §14):
// apply_adjustment_rpc, apply_credit_note_rpc.

import { supabase, toNum, must } from "./shared.js";

export async function getAdjustments(/* payload */) {
  const { data, error } = await supabase
    .from("adjustments")
    .select("*")
    .order("created_at", { ascending: false });
  must(error);
  return { adjustments: data || [] };
}

export async function addAdjustment(payload) {
  const { data, error } = await supabase
    .from("adjustments")
    .insert([
      {
        customer_id: payload.customerId,
        bill_id: payload.billId,
        amount: toNum(payload.amount),
        reason: payload.reason,
        applied: false,
        date: payload.date,
      },
    ])
    .select()
    .single();
  must(error);
  return { adjustmentId: data.id };
}

export async function applyAdjustment(payload) {
  const { adjustmentId, billId, version } = payload;
  if (!adjustmentId) throw new Error("adjustmentId is required");
  if (!billId) throw new Error("billId is required");
  if (version === undefined)
    throw new Error("adjustment version is required for OCC");

  const { error } = await supabase.rpc("apply_adjustment_rpc", {
    p_adjustment_id: adjustmentId,
    p_bill_id: billId,
    p_version: version,
  });

  if (error) {
    if (error.message.includes("CONFLICT")) {
      const e = new Error(
        "CONFLICT: This adjustment was modified elsewhere. Please refresh.",
      );
      e.code = "CONFLICT";
      throw e;
    }
    if (error.message.includes("already been applied")) {
      const e = new Error("This adjustment has already been applied.");
      e.code = "ALREADY_APPLIED";
      throw e;
    }
    if (error.message.includes("locked")) {
      const e = new Error("Cannot apply an adjustment to a locked bill.");
      e.code = "LOCKED";
      throw e;
    }
    throw new Error(error.message || "Failed to apply adjustment");
  }

  return { adjustmentId, billId };
}

export async function getCreditNotes(/* payload */) {
  const { data, error } = await supabase
    .from("credit_notes")
    .select("*")
    .order("created_at", { ascending: false });
  must(error);
  return { creditNotes: data || [] };
}

export async function addCreditNote(payload) {
  const { data, error } = await supabase
    .from("credit_notes")
    .insert([
      {
        customer_id: payload.customerId,
        bill_id: payload.billId || null,
        amount: toNum(payload.amount),
        reason: payload.reason,
        applied: false,
        date: payload.date,
      },
    ])
    .select()
    .single();
  must(error);
  return { creditNoteId: data.id };
}

export async function applyCreditNote(payload) {
  const { creditNoteId, billId, version } = payload;
  if (!creditNoteId) throw new Error("creditNoteId is required");
  if (!billId) throw new Error("billId is required");
  if (version === undefined)
    throw new Error("credit note version is required for OCC");

  const { data, error } = await supabase.rpc("apply_credit_note_rpc", {
    p_credit_note_id: creditNoteId,
    p_bill_id: billId,
    p_version: version,
  });

  if (error) {
    if (error.message.includes("CONFLICT")) {
      const e = new Error(
        "CONFLICT: This credit note was modified elsewhere. Please refresh.",
      );
      e.code = "CONFLICT";
      throw e;
    }
    if (error.message.includes("already been applied")) {
      const e = new Error("This credit note has already been applied.");
      e.code = "ALREADY_APPLIED";
      throw e;
    }
    if (error.message.includes("locked")) {
      const e = new Error("Cannot apply a credit note to a locked bill.");
      e.code = "LOCKED";
      throw e;
    }
    throw new Error(error.message || "Failed to apply credit note");
  }

  return {
    creditNoteId,
    billId,
    newPaid: data?.newPaid,
    status: data?.status,
  };
}
