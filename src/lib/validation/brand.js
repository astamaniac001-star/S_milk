// Brand save validation. Extracted from useAdminHandlers#saveBrand so the
// rules are testable without React or Supabase. Each helper returns an error
// string or null — the same contract as validateCustomerForm /
// validateImportForm / validateSubscriptionForm.

// Resolve the brand name from either the BrandModal form or the edit target.
// Both shapes are accepted because the modal is shared by add and edit.
export function resolveBrandName(form = {}, modalData = {}) {
  return (
    form.name || form.brandName || modalData?.name || modalData?.brandName || ""
  );
}

// Duplicate names make the name-based import prefill ambiguous. save_brand_rpc
// deliberately has no name-unique constraint (renames must not break existing
// milk_imports name references), so the guard lives here: block a NEW
// duplicate and block renaming onto another brand's name, while an edit that
// keeps its own name still passes (`b.id !== editId`).
export function findDuplicateBrand(brands, name, editId) {
  const target = String(name || "")
    .trim()
    .toLowerCase();
  return (brands || []).find(
    (b) =>
      String(b.name || "")
        .trim()
        .toLowerCase() === target && b.id !== editId,
  );
}

// Normalize BrandModal's rates array ({ milkType, rate } rows) or the legacy
// single { defaultType, rate } shape into one canonical array. Rows with no
// milk type are dropped — they cannot be persisted (brand_rates identity is
// (brand_id, milk_type)).
export function normalizeBrandRates(form = {}) {
  const raw = Array.isArray(form.rates)
    ? form.rates
    : form.rate !== undefined && form.rate !== ""
      ? [
          {
            milkType: form.defaultType || "Full Cream",
            rate: Number(form.rate),
          },
        ]
      : [];
  return raw.filter((r) => String(r?.milkType ?? "").trim() !== "");
}

export function validateBrandName(brandName) {
  if (!brandName || !String(brandName).trim()) return "Brand name is required";
  return null;
}

// One rate per milk type per brand (brand_rates UNIQUE (brand_id, milk_type)).
// The RPC rejects duplicates, but failing here keeps the operator in the
// editor with an actionable message instead of a server-side error. ₹0 is
// rejected by decision (2026-11-21): free milk must be an explicit pricing
// decision, not a forgotten rate — a zero rate silently prices that brand's
// deliveries at ₹0 at billing time.
export function validateBrandRates(rates) {
  if (!Array.isArray(rates) || rates.length === 0)
    return "Enter a rate for at least one milk type";
  const seenTypes = new Set();
  for (const r of rates) {
    const type = String(r.milkType).trim();
    if (seenTypes.has(type))
      return `"${type}" already has a rate for this brand`;
    seenTypes.add(type);
    if (r.rate === "" || r.rate === undefined || r.rate === null)
      return `Enter a rate for "${type}"`;
    const rate = Number(r.rate);
    if (!Number.isFinite(rate) || rate <= 0)
      return `Enter a rate greater than 0 for "${type}"`;
  }
  return null;
}
