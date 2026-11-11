// lib/api/mappers.js — DB snake_case → UI camelCase, and UI → DB.
//
// Every DB→UI conversion happens here (rule §4). Each mapXFromApi is defensive
// against null/undefined via `toNum`; boolean coercion via `!!`; array via
// `toArray`. Version fields default to 1 only when the column is nullish
// (`?? 1`) — a legitimate `version = 0` is now preserved so OCC compare-and-set
// sees the real value instead of being silently bumped to 1. Numeric
// columns that genuinely default to 0 (e.g. balance) keep `|| 0` since 0 is
// a no-op fallback for the empty/null case anyway.

import { toArray, toNum, getToday } from "./shared.js";

export function mapCustomerFromApi(c) {
  // Subscription-centric model: customers are identity-only (name/phone/
  // address/status). The legacy `product` / `daily_qty` / `delivery_days`
  // columns are deprecated in the DB and intentionally NOT mapped — milk
  // type, quantity, and schedule live on `subscriptions` now.
  return {
    id: c.id,
    name: c.name,
    address: c.delivery_address,
    phone: c.phone,
    status: c.status,
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
    // Brand-aware identity: the log's brand resolves pricing and the
    // Delivery page's brand breakdown directly; null for legacy/unbranded
    // rows (UI falls back to matchBrandByMilkType).
    brandId: l.brand_id ?? null,
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
    version: toNum(a.version ?? 1),
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
  // `rates` comes from the FK-embedded `brand_rates(milk_type, rate_per_liter)`
  // rows (getBrands uses an embedded select). Plain-select callers that skip
  // the embed get `rates: []` — brand×type pricing then falls back to the
  // legacy defaultMilkType/rate columns. Kept in sync by save_brand_rpc.
  const rates = Array.isArray(b.brand_rates)
    ? b.brand_rates
        .map((r) => ({ milkType: r.milk_type, rate: toNum(r.rate_per_liter) }))
        .sort((x, y) => String(x.milkType).localeCompare(String(y.milkType)))
    : [];
  return {
    id: b.id,
    name: b.brand_name,
    status: b.status,
    supplier: b.supplier_name,
    phone: b.supplier_phone,
    defaultMilkType: b.default_milk_type,
    rate: toNum(b.rate_per_liter),
    rates,
  };
}

export function mapSubscriptionFromApi(s) {
  return {
    id: s.id,
    customerId: s.customer_id,
    brandId: s.brand_id ?? null,
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
    // Written by apply_credit_note_rpc when the note is applied — kept
    // separate from `bill_id` (the bill the note was issued against) so an
    // applied note can be traced to the bill it actually reduced.
    appliedToBillId: c.applied_to_bill_id,
    amount: toNum(c.amount),
    reason: c.reason,
    applied: !!c.applied,
    date: c.date,
    version: toNum(c.version ?? 1),
  };
}

// ── UI → DB ──────────────────────────────────────────────────────────────

export function mapCustomerToApi(form) {
  // Subscription-centric model: only identity fields are written. The legacy
  // customers.product/daily_qty/delivery_days columns are deprecated — DB
  // defaults fill them harmlessly and nothing reads them anymore. Milk type,
  // quantity, and schedule are owned by `subscriptions` (mapSubscriptionToApi).
  return {
    customerId: form.id || undefined,
    expectedVersion: form.version,
    name: form.name,
    deliveryAddress: form.address,
    phone: form.phone,
    status: form.status,
  };
}

export function mapSubscriptionToApi(form) {
  const out = {
    customerId: form.customerId,
    // Brand is required by the UI on add/edit; null only for legacy rows
    // that predate the brand dimension (pricing falls back to the legacy
    // milk-type heuristic for those).
    brandId: form.brandId || null,
    milkType: form.milkType || "Full Cream",
    // The modal renders qty 1 when the form has no qty yet — persist that
    // visible default instead of writing 0. An EXPLICIT 0 is preserved so
    // the API's "Quantity must be greater than 0" guard still fires.
    qty: form.qty === undefined ? 1 : toNum(form.qty),
    deliveryDays: form.deliveryDays,
    isActive: form.isActive !== undefined ? form.isActive : true,
  };
  if (form.id) {
    out.id = form.id;
    out.expectedVersion = form.version;
  }
  return out;
}

export function mapBrandToApi(form) {
  // save_brand_rpc payload: { pBrand: {...}, pRates: [...] }. The RPC reads
  // jsonb fields with ->>'brand_name' style keys, so this payload stays in
  // DB snake_case even though it never passes through a table mapper (§15).
  const brand = {
    brand_name: form.name,
    supplier_name: form.supplier || null,
    supplier_phone: form.phone || null,
    status: form.status || "Active",
  };
  if (form.id) brand.id = form.id;
  const rates = (form.rates || [])
    .filter((r) => r && (r.milkType || "").trim())
    .map((r) => ({
      milk_type: String(r.milkType).trim(),
      rate_per_liter: toNum(r.rate),
    }));
  return { brand, rates };
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
  // Idempotency contract (AGENTS §14): a retryable write must reuse the SAME
  // key for the same user attempt so the DB uniqueness guard can deduplicate
  // a network-blip retry. The caller owns the key lifecycle (mint on a fresh
  // user submit, reuse on retry of that submit, mint fresh on the next
  // distinct submit). MINTING HERE WAS A BUG — a fresh UUID per call
  // defeated the `record_payment_rpc` uniqueness guard, letting a manual
  // retry after a successful-but-unacknowledged RPC double-charge the
  // customer. A silent fallback `|| generateKey()` was ALSO removed
  // (audit 2026-11-09): a caller that forgets the key must fail loudly here,
  // not silently lose dedup protection.
  if (!opts.idempotencyKey) {
    throw new Error(
      "mapPaymentToApi requires opts.idempotencyKey — mint one per user attempt and reuse it on retry of that attempt (AGENTS §14)",
    );
  }
  return {
    billId,
    amount: Number(amount),
    mode: opts.mode || "Cash",
    date: opts.date || getToday(),
    note: opts.note,
    idempotencyKey: opts.idempotencyKey,
  };
}
