// lib/api/billing.js — bills list/lock/unlock + atomic payment RPC delegation
// + atomic bill-generation RPC + WhatsApp text. Per rule §14 every money
// mutation here uses a single transactional RPC.

import {
  supabase,
  toNum,
  getToday,
  fmt,
  must,
  updateWithVersion,
} from "./shared.js";
import { mapBillFromApi } from "./mappers.js";

export async function getBills(payload) {
  let query = supabase.from("bills").select("*");
  if (payload.month) query = query.eq("month", payload.month);
  const { data, error } = await query.order("created_at", { ascending: false });
  must(error);
  return { bills: data.map(mapBillFromApi) };
}

export async function lockBill(payload) {
  const { billId, version } = payload;
  await updateWithVersion("bills", billId, version, { locked: true });
  return undefined;
}

export async function unlockBill(payload) {
  const { billId, version } = payload;
  await updateWithVersion("bills", billId, version, { locked: false });
  return undefined;
}

export async function recordPayment(payload) {
  const { billId, amount, mode, date, note, idempotencyKey } = payload;
  if (!billId || !(toNum(amount) > 0))
    throw new Error("A valid billId and amount are required");

  const { data: rpcResult, error: rpcError } = await supabase.rpc(
    "record_payment_rpc",
    {
      p_bill_id: billId,
      p_amount: toNum(amount),
      p_mode: mode || "Cash",
      p_date: date || getToday(),
      p_note: note || "",
      p_idempotency_key: idempotencyKey,
    },
  );

  if (rpcError) {
    if (rpcError.message.includes("locked")) {
      const e = new Error("This bill is locked.");
      e.code = "LOCKED";
      throw e;
    }
    if (rpcError.message.includes("exceeds")) {
      const e = new Error(rpcError.message);
      e.code = "OVERPAY";
      throw e;
    }
    // Raw check-violation surface (2026-11-21 audit P1-2): a 23514 on
    // chk_bills_paid_lte_amount means the payment passed the RPC's epsilon
    // guard but overflowed the exact constraint — report it in OVERPAY
    // terms instead of an opaque Postgres message.
    if (rpcError.code === "23514" || /chk_bills_paid_lte_amount/.test(rpcError.message)) {
      const e = new Error(
        "Payment exceeds the pending amount on this bill. Record the exact pending amount.",
      );
      e.code = "OVERPAY";
      throw e;
    }
    throw rpcError;
  }

  // FIX (2026-11-21 audit P2-6): the RPC has COMMITTED at this point — a
  // failed follow-up read must NOT surface as "payment failed" (the old
  // must(fetchErr) turned a landed payment into an error toast). Report
  // refreshFailed instead so the handler can warn accurately.
  let updatedBill = null;
  let refreshFailed = false;
  try {
    const { data, error: fetchErr } = await supabase
      .from("bills")
      .select("*")
      .eq("id", billId)
      .single();
    must(fetchErr);
    updatedBill = data;
  } catch {
    refreshFailed = true;
  }

  return {
    billId,
    amountPaid: updatedBill?.amount_paid ?? null,
    status: updatedBill?.status ?? null,
    bill: updatedBill ? mapBillFromApi(updatedBill) : null,
    idempotent: rpcResult?.idempotent || false,
    refreshFailed,
  };
}

export async function generateMonthBill(payload) {
  const { customerId, month } = payload;
  if (!customerId || !month)
    throw new Error("customerId and month are required");

  const { error: rpcError } = await supabase.rpc("generate_month_bill_rpc", {
    p_customer_id: customerId,
    p_month: month,
  });

  if (rpcError) {
    if (rpcError.message.includes("locked")) {
      const e = new Error("Cannot regenerate a locked bill.");
      e.code = "LOCKED";
      throw e;
    }
    // Guard added in the 2026-11-21 migration: regeneration computed an
    // amount BELOW what was already paid — a typed error, not a raw 23514.
    if (/less than .*already paid|REGUNDERFLOW/i.test(rpcError.message)) {
      const e = new Error(rpcError.message);
      e.code = "OVERPAY";
      throw e;
    }
    throw rpcError;
  }

  // FIX (2026-11-21 audit P2-6): same refreshFailed semantics as
  // recordPayment — the bill EXISTS once the RPC returns; a failed read
  // must not report the generation itself as failed.
  let billData = null;
  let refreshFailed = false;
  try {
    const { data, error: fetchErr } = await supabase
      .from("bills")
      .select("*")
      .eq("customer_id", customerId)
      .eq("month", month)
      .single();
    must(fetchErr);
    billData = data;
  } catch {
    refreshFailed = true;
  }

  return {
    bill: billData ? mapBillFromApi(billData) : null,
    action: "generated",
    refreshFailed,
  };
}

export async function getBillText(payload) {
  const { billId } = payload;
  if (!billId) throw new Error("billId is required");
  const { data: bill, error: billErr } = await supabase
    .from("bills")
    .select("*")
    .eq("id", billId)
    .single();
  must(billErr);
  // FIX (audit 2026-07-24): previous version swallowed the customer-fetch
  // error silently, producing a misleading "Hi there" string.
  const { data: cust, error: custErr } = await supabase
    .from("customers")
    .select("name")
    .eq("id", bill.customer_id)
    .maybeSingle();
  must(custErr);
  const pending = toNum(bill.amount) - toNum(bill.amount_paid);
  const text =
    `Hi ${cust?.name || "there"}, your milk bill for ${bill.month} is ` +
    `${fmt(toNum(bill.amount))}. Paid so far: ${fmt(toNum(bill.amount_paid))}. ` +
    (pending > 0 ? `Pending: ${fmt(pending)}.` : "Fully paid — thank you!");
  return { text };
}
