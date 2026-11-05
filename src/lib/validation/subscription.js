// Brand-aware subscription validation. Brand and milk type are both required
// (the operator's call: price and supply differ brand-to-brand AND
// type-to-type). `validateSubscriptionForm` returns an error string or null —
// same contract as validateCustomerForm / validateImportForm.
export function validateSubscriptionForm(form) {
  if (!form.customerId) return "Customer is required";
  if (!form.brandId) return "Brand is required";
  if (!form.milkType?.trim()) return "Milk type is required";
  const qty = Number(form.qty);
  if (!(qty > 0)) return "Quantity must be greater than 0";
  if (!Array.isArray(form.deliveryDays) || form.deliveryDays.length === 0)
    return "Select at least one delivery day";
  return null;
}
