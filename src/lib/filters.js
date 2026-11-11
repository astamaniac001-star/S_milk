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

// Import list filter. `mode` selects the date dimension (2026-11-10 —
// Imports Day/Date-range views):
//   "month" (default) — `i.date` starts with `month` (original behavior);
//   "day"             — exact `i.date === day`;
//   "range"           — inclusive `from <= i.date <= to`. YYYY-MM-DD strings
//                       compare correctly lexically, so no Date parsing and
//                       no timezone drift.
// All modes compose with the brand/status filters. Defensive date guards
// preserved (the `date` column is NOT NULL in DB, but `i.date` could still
// be undefined on malformed UI rows or staged updates — return false
// instead of throwing on null/undefined).
export function filterImports(
  imports,
  { mode = "month", month, day, from, to, brand, status } = {},
) {
  return (imports || []).filter((i) => {
    if (brand && i.brand !== brand) return false;
    if (status && i.status !== status) return false;
    const d = i.date;
    const validDate = d && typeof d === "string";
    if (mode === "day") {
      if (!day) return true; // empty day = no date constraint
      return validDate && d === day;
    }
    if (mode === "range") {
      if (!from && !to) return true; // empty window = no date constraint
      if (!validDate) return false;
      if (from && d < from) return false;
      if (to && d > to) return false;
      return true;
    }
    if (!month) return true;
    return validDate && d.startsWith(month);
  });
}

// Default From/To window for the Imports "By date range" view: the first day
// of the PREVIOUS month through `today`, so opening the picker immediately
// covers "previous month + current month" (operator request 2026-11-10).
// Month math is UTC-anchored with day=1 so the Dec→Jan rollback is correct
// in every timezone. `today` is a YYYY-MM-DD string from getToday().
export function defaultImportRange(today) {
  if (typeof today !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(today)) {
    return { from: "", to: "" };
  }
  const [y, m] = today.split("-").map(Number);
  const prev = new Date(Date.UTC(y, m - 2, 1)); // month before, day 1
  const from = `${prev.getUTCFullYear()}-${String(prev.getUTCMonth() + 1).padStart(2, "0")}-01`;
  return { from, to: today };
}

// Month options for the Imports page filter, derived from the data itself.
// A native <select> works on every browser, unlike <input type="month">
// which falls back to a bare text field on Firefox and several Android
// WebViews — the operator could not reach previous imports at all.
// Returns [{ value: "YYYY-MM", label: "Nov 2026" }], newest first.
const MONTH_SHORT = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
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
