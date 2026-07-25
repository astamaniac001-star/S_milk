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
    throw rpcError;
  }

  const { data: updatedBill, error: fetchErr } = await supabase
    .from("bills")
    .select("*")
    .eq("id", billId)
    .single();
  must(fetchErr);

  return {
    billId: updatedBill.id,
    amountPaid: updatedBill.amount_paid,
    status: updatedBill.status,
    bill: mapBillFromApi(updatedBill),
    idempotent: rpcResult?.idempotent || false,
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
    throw rpcError;
  }

  const { data: billData, error: fetchErr } = await supabase
    .from("bills")
    .select("*")
    .eq("customer_id", customerId)
    .eq("month", month)
    .single();
  must(fetchErr);

  return { bill: mapBillFromApi(billData), action: "generated" };
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
