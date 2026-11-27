// ── src/lib/breakdowns.js ─────────────────────────────────────────────────────
// Pure aggregations shared by the Delivery "Total" view and the Imports
// breakdown modals. No React, no DOM — unit-tested in isolation.
//
// Audit 2026-11-09 F16 originally de-duplicated the sort expression and the
// table markup; the 2026-11 redesign completes the job by moving the actual
// aggregation math out of both pages (it had drifted: Delivery grouped by
// brand→milk map, Imports grouped by a flat "brand||type" key).

import { brandLabel, toNum } from "./utils.js";

// Stable sort: brand name, then milk type. Returns the same array.
export function sortBrandTypeRows(rows) {
  return rows.sort((a, b) =>
    a.brand === b.brand
      ? String(a.type ?? "").localeCompare(String(b.type ?? ""))
      : String(a.brand ?? "").localeCompare(String(b.brand ?? "")),
  );
}

// Aggregate imports by brand + milk type: quantities and cost.
// Returns [{ brand, type, qty, cost }] sorted brand → type.
export function buildQuantityBreakdown(imports) {
  const map = new Map();
  (imports || []).forEach((i) => {
    const brand = i.brand ?? "Unknown brand";
    const type = i.type || "Mixed";
    const key = `${brand}||${type}`;
    if (!map.has(key)) map.set(key, { brand, type, qty: 0, cost: 0 });
    const row = map.get(key);
    row.qty += toNum(i.qty);
    row.cost += toNum(i.total);
  });
  return sortBrandTypeRows(Array.from(map.values()));
}

// Aggregate CONFIRMED imports and DELIVERED logs into stock rows per
// brand + milk type.
//
// `filterLogsByDate` (default true) keeps only logs whose `date` matches
// `date`. The Delivery page already receives logs scoped to the viewed date
// and passes false to preserve its historical behavior; the Imports modal
// passes true because it receives the wider `logs` collection.
//
// Returns { rows: [{ brand, type, imported, delivered, balance }], totals }.
export function buildStockBreakdown({
  imports = [],
  logs = [],
  brands = [],
  date,
  filterLogsByDate = true,
} = {}) {
  const dayImports = (imports || []).filter(
    (i) => i.status === "Confirmed" && i.date === date,
  );
  const deliveredLogs = (logs || []).filter(
    (l) => l.delivered && (!filterLogsByDate || l.date === date),
  );

  const map = new Map();
  const ensure = (brand, type) => {
    const key = `${brand}||${type}`;
    if (!map.has(key)) {
      map.set(key, { brand, type, imported: 0, delivered: 0 });
    }
    return map.get(key);
  };

  dayImports.forEach((i) => {
    if (!i.brand) return;
    const r = ensure(i.brand, i.type || "Mixed");
    r.imported += toNum(i.qty);
  });

  deliveredLogs.forEach((l) => {
    const milkType = l.product || "Milk";
    // Brand-aware: log.brandId resolves directly; legacy rows fall back to
    // the milk-type heuristic inside brandLabel.
    const brandName = brandLabel(l, brands);
    const r = ensure(brandName, milkType);
    r.delivered += toNum(l.qty);
  });

  const rows = sortBrandTypeRows(Array.from(map.values())).map((r) => ({
    ...r,
    balance: r.imported - r.delivered,
  }));

  const totals = rows.reduce(
    (acc, r) => {
      acc.imported += r.imported;
      acc.delivered += r.delivered;
      return acc;
    },
    { imported: 0, delivered: 0 },
  );

  return { rows, totals };
}
