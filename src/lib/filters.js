// Pure list filters — no React, easy to test in isolation.

export function filterCustomers(customers, search, statusFilter) {
  // FIXED: Added null/undefined guard and trim
  const q = (search || "").toLowerCase().trim();

  return customers.filter((c) => {
    const matchesStatus =
      !statusFilter || statusFilter === "All" || c.status === statusFilter;
    if (!matchesStatus) return false;

    if (!q) return true;

    return (
      (c.name && c.name.toLowerCase().includes(q)) ||
      (c.phone && c.phone.includes(q)) ||
      (c.address && c.address.toLowerCase().includes(q)) ||
      (c.id && c.id.toLowerCase().includes(q))
    );
  });
}

export function filterImports(imports, { month, brand, status }) {
  return imports.filter(
    (i) =>
      (!brand || i.brand === brand) &&
      (!status || i.status === status) &&
      // FIX (audit 2026-07-25, defensive): the `date` column is NOT NULL in
      // DB, but `i.date` could still be undefined on malformed UI rows or
      // staged updates. Guard the `.startsWith()` so the filter returns false
      // instead of throwing on null/undefined.
      (!month || (i.date && typeof i.date === "string" && i.date.startsWith(month))),
  );
}

// Month options for the Imports page filter, derived from the data itself.
// A native <select> works on every browser, unlike <input type="month">
// which falls back to a bare text field on Firefox and several Android
// WebViews — the operator could not reach previous imports at all.
// Returns [{ value: "YYYY-MM", label: "Nov 2026" }], newest first.
const MONTH_SHORT = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

export function buildMonthOptions(imports) {
  const months = new Set();
  for (const i of imports || []) {
    if (typeof i?.date === "string" && /^\d{4}-\d{2}/.test(i.date)) {
      months.add(i.date.slice(0, 7));
    }
  }
  return Array.from(months)
    .sort()
    .reverse()
    .map((ym) => {
      const mIdx = Number(ym.slice(5, 7)) - 1;
      const label =
        mIdx >= 0 && mIdx < 12 ? `${MONTH_SHORT[mIdx]} ${ym.slice(0, 4)}` : ym;
      return { value: ym, label };
    });
}

export function filterBills(bills, billFilter) {
  return billFilter === "All"
    ? bills
    : bills.filter((b) => b.status === billFilter);
}
