// Imports filter bar: view mode (month / day / range) + the active mode's
// picker + brand + status. Ids, names, aria-labels and class names are the
// contract — e2e and the page unit tests select on them, so they must not
// change without updating those suites.

import { useMemo } from "react";
import { getToday } from "../../lib/utils.js";
import { buildMonthOptions, defaultImportRange } from "../../lib/filters.js";
import { Card } from "../../components/ui.jsx";

const STATUS_FILTERS = ["Draft", "Confirmed", "Reconciled"];

export function ImportFilters({
  impFilter = {},
  allImports = [],
  brands = [],
  onImpFilterChange,
  today,
}) {
  const viewMode = impFilter.mode || "month";
  const monthOptions = useMemo(
    () => buildMonthOptions(allImports),
    [allImports],
  );

  // Mode switch with sensible defaults so a freshly-picked mode is
  // immediately useful: Day → today; Range → first of the previous month
  // through today (the operator's "previous + current month" window).
  // getToday() is IST-derived (rule §8).
  const handleViewMode = (mode) => {
    const next = { ...impFilter, mode };
    if (mode === "day" && !next.day) next.day = today || getToday();
    if (mode === "range" && !next.from && !next.to) {
      Object.assign(next, defaultImportRange(today || getToday()));
    }
    onImpFilterChange(next);
  };

  return (
    <Card>
      <div className="filter-bar">
        {/* View mode (2026-11-10): month (as before), a single day, or an
            inclusive date range. Only the active mode's picker renders, so
            the default month view is unchanged for existing flows/e2e. */}
        <select
          id="import-view"
          name="import-view"
          aria-label="Show imports by"
          className="input filter-control"
          value={viewMode}
          onChange={(e) => handleViewMode(e.target.value)}
        >
          <option value="month">By month</option>
          <option value="day">By day</option>
          <option value="range">By date range</option>
        </select>
        {viewMode === "month" && (
          <select
            id="import-month"
            name="import-month"
            aria-label="Filter imports by month"
            className="input filter-control"
            value={impFilter.month || ""}
            onChange={(e) =>
              onImpFilterChange({ ...impFilter, month: e.target.value })
            }
          >
            <option value="">All months</option>
            {monthOptions.map((m) => (
              <option key={m.value} value={m.value}>
                {m.label}
              </option>
            ))}
          </select>
        )}
        {viewMode === "day" && (
          <input
            type="date"
            id="import-day"
            name="import-day"
            aria-label="Show imports for date"
            className="input filter-control"
            value={impFilter.day || ""}
            onChange={(e) =>
              onImpFilterChange({ ...impFilter, day: e.target.value })
            }
          />
        )}
        {viewMode === "range" && (
          <>
            <input
              type="date"
              id="import-from"
              name="import-from"
              aria-label="Show imports from date"
              className="input filter-control"
              value={impFilter.from || ""}
              onChange={(e) =>
                onImpFilterChange({ ...impFilter, from: e.target.value })
              }
            />
            <input
              type="date"
              id="import-to"
              name="import-to"
              aria-label="Show imports to date"
              className="input filter-control"
              value={impFilter.to || ""}
              onChange={(e) =>
                onImpFilterChange({ ...impFilter, to: e.target.value })
              }
            />
          </>
        )}
        <select
          id="import-brand"
          name="import-brand"
          aria-label="Filter imports by brand"
          className="input filter-control"
          value={impFilter.brand || ""}
          onChange={(e) =>
            onImpFilterChange({ ...impFilter, brand: e.target.value })
          }
        >
          <option value="">All Brands</option>
          {(brands || []).map((b) => (
            <option key={b.id} value={b.name}>
              {b.name}
            </option>
          ))}
        </select>
        <select
          id="import-status"
          name="import-status"
          aria-label="Filter imports by status"
          className="input filter-control"
          value={impFilter.status || ""}
          onChange={(e) =>
            onImpFilterChange({ ...impFilter, status: e.target.value })
          }
        >
          <option value="">All Status</option>
          {STATUS_FILTERS.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </div>
    </Card>
  );
}
