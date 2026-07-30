// lib/api/mappers.js — DB snake_case → UI camelCase, and UI → DB.
//
// Every DB→UI conversion happens here (rule §4). Each mapXFromApi is defensive
// against null/undefined via `toNum`; boolean coercion via `!!`; array via
// `toArray`. Version fields default to 1 only when the column is nullish
// (`?? 1`) — a legitimate `version = 0` is now preserved so OCC compare-and-set
// sees the real value instead of being silently bumped to 1. Numeric
// columns that genuinely default to 0 (e.g. balance) keep `|| 0` since 0 is
// a no-op fallback for the empty/null case anyway.

import { toArray, toNum, getToday, generateKey } from "./shared.js";

export function mapCustomerFromApi(c) {
  return {
    id: c.id,
    name: c.name,
    address: c.delivery_address,
    phone: c.phone,
    status: c.status,
    product: c.product,
    qty: toNum(c.daily_qty),
    deliveryDays: toArray(c.delivery_days),
    balance: toNum(c.balance || 0),
    version: toNum(c.version ?? 1),
  };
}

export function mapBillFromApi(b) {
  // The `bills` table has no `due_date` column (verified against
  // database.types.ts + supabase/schema.sql). The previous mapper read
  // `b.due_date` → always undefined, which surfaced as "Due undefined" text
  // in Billing.jsx and BillDetailModal.jsx. The field is dropped here and in
  // both UI sites. If a due-date column is added later, reintroduce it here
  // AND in the same places — do not silently reconnect.
  return {
    id: b.id,
    custId: b.customer_id,
    month: b.month,
    amount: toNum(b.amount),
    paid: toNum(b.amount_paid),
    status: b.status,
    locked: !!b.locked,
    version: toNum(b.version ?? 1),
  };
}

export function mapImportFromApi(i) {
  return {
    id: i.id,
    brand: i.brand_name,
    type: i.milk_type,
    qty: toNum(i.quantity),
    rate: toNum(i.rate_per_liter),
    total: toNum(i.total_cost),
    supplier: i.supplier_name,
    date: i.date,
    status: i.status,
    version: toNum(i.version ?? 1),
  };
}

export function mapLogFromApi(l) {
  return {
    id: l.id,
    custId: l.customer_id,
    date: l.date,
    delivered: !!l.delivered,
    qty: toNum(l.qty),
    product: l.product,
    note: l.note,
  };
}

export function mapAdjustmentFromApi(a) {
  return {
    adjustmentId: a.id,
    billId: a.bill_id,
    customerId: a.customer_id,
    amount: toNum(a.amount),
    reason: a.reason,
    applied: !!a.applied,
    date: a.date,
    version: a.version ?? 1,
  };
}

export function mapPauseFromApi(p) {
  return {
    id: p.id,
    custId: p.customer_id,
    start: p.start_date,
    end: p.end_date,
    reason: p.reason,
  };
}

export function mapBrandFromApi(b) {
  return {
    id: b.id,
    name: b.brand_name,
    status: b.status,
    supplier: b.supplier_name,
    phone: b.supplier_phone,
    defaultMilkType: b.default_milk_type,
    rate: toNum(b.rate_per_liter),
  };
}

export function mapSubscriptionFromApi(s) {
  return {
    id: s.id,
    customerId: s.customer_id,
    milkType: s.milk_type,
    qty: toNum(s.qty),
    deliveryDays: toArray(s.delivery_days),
    isActive: !!s.is_active,
    version: toNum(s.version ?? 1),
  };
}

export function mapCreditNoteFromApi(c) {
  return {
    id: c.id,
    customerId: c.customer_id,
    billId: c.bill_id,
    amount: toNum(c.amount),
    reason: c.reason,
    applied: !!c.applied,
    date: c.date,
    version: c.version ?? 1,
  };
}

// ── UI → DB ──────────────────────────────────────────────────────────────

export function mapCustomerToApi(form) {
  // Default `product` / `dailyQty` to the same canonical constants the modal
  // uses for its visible default (`CustomerModal.jsx:50,63` → "Full Cream"
  // and 1). Without this, an operator who opens Add Customer and clicks
  // Save without touching the Product/Qty dropdowns leaves them as
  // `undefined` in form state — the mapper passes `undefined` through, and
  // `customers.product` gets written NULL. The downstream `generate_month_
  // bill_rpc` then errors with "No active rate found for milk type <NULL>"
  // because it derives milk type from `customers.product`, not from the
  // `daily_logs.product` rows the daily-log generator writes. Defaulting
  // here is the single-source-of-truth fix per rule §4 — the mapper owns
  // the UI↔DB shape contract, so the default belongs here, not scattered
  // across every caller of `openModal`.
  return {
    customerId: form.id || undefined,
    expectedVersion: form.version,
    name: form.name,
    deliveryAddress: form.address,
    phone: form.phone,
    product: form.product || "Full Cream",
    dailyQty: form.qty ?? 1,
    deliveryDays: form.deliveryDays,
    status: form.status,
  };
}

export function mapImportToApi(form) {
  const out = {
    brandName: form.brand,
    milkType: form.type,
    quantity: Number(form.qty),
    ratePerLiter: Number(form.rate),
    supplierName: form.supplier,
    date: form.date,
  };
  if (form.id) {
    out.id = form.id;
    out.expectedVersion = form.version;
  }
  // NOTE: milk_imports has no idempotency_key column. The previous code
  // generated one here and then dropped it in the addMilkImport case — dead
  // computation. Removed per audit 2026-07-24.
  return out;
}

export function mapPaymentToApi(billId, amount, opts = {}) {
  return {
    billId,
    amount: Number(amount),
    mode: opts.mode || "Cash",
    date: opts.date || getToday(),
    note: opts.note,
    idempotencyKey: generateKey(),
  };
}
