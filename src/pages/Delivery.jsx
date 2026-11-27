// ── Delivery.jsx ──────────────────────────────────────────────────────────────
// Daily delivery route: pick a date, generate the day's scheduled logs, mark
// each customer delivered/skipped, add an ad-hoc extra, and inspect the
// brand × milk-type stock balance for the day.

import { useMemo, useState } from "react";
import { useBusy } from "../hooks/useBusy.js";
import { brandLabel, getToday, shiftDate } from "../lib/utils.js";
import { buildStockBreakdown } from "../lib/breakdowns.js";
import { Card, Empty, Btn } from "../components/ui.jsx";
import {
  CalendarDays,
  Check,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Droplets,
  Loader2,
  Search,
  Truck,
  X,
  XCircle,
  Zap,
} from "lucide-react";

function calculateDeliveryStats(logs) {
  const safeLogs = Array.isArray(logs) ? logs : [];
  const delivered = safeLogs.filter((l) => l.delivered);
  return {
    scheduled: safeLogs.length,
    deliveredCount: delivered.length,
    skippedCount: safeLogs.filter((l) => !l.delivered).length,
    totalLiters:
      delivered.reduce((s, l) => s + Number(l.qty || 0), 0).toFixed(1) + " L",
  };
}

function getToggleButtonText(delivered) {
  return delivered ? "Done" : "Skip";
}

function DeliveryLogItem({
  id,
  name,
  brand,
  product,
  qty,
  delivered,
  onToggle,
  readOnly,
}) {
  const ToggleIcon = delivered ? Check : X;
  return (
    <div className="row">
      <div className="row-main">
        <div className="row-title">{name}</div>
        <div className="row-sub">
          {brand ? `${brand} · ` : ""}
          {product} · {qty}L
        </div>
      </div>
      {readOnly ? (
        <span
          className={`delivery-status ${delivered ? "done" : "skip"}`}
          aria-label={`${name} ${delivered ? "delivered" : "skipped"}`}
        >
          <ToggleIcon size={12} aria-hidden="true" />
          {getToggleButtonText(delivered)}
        </span>
      ) : (
        <button
          type="button"
          onClick={() => onToggle(id, !delivered)}
          className={`delivery-toggle ${delivered ? "done" : "skip"}`}
          aria-label={`Mark ${name} as ${delivered ? "skipped" : "delivered"}`}
          aria-pressed={delivered}
        >
          <ToggleIcon size={12} aria-hidden="true" />
          {getToggleButtonText(delivered)}
        </button>
      )}
    </div>
  );
}

function resolveLog(l, customerMap, brands) {
  const c = customerMap[l.custId];
  return {
    id: l.id,
    name: c?.name ?? "Unknown Customer",
    // product lives on the log row (subscription-centric model); the legacy
    // customers.product column is deprecated and never mapped — audit
    // 2026-11-09 removed the dead `c?.product` reference.
    product: l.product ?? "Milk",
    // Only show a brand when the row actually resolves one — legacy/brandless
    // rows would otherwise read "Unknown brand · Milk".
    brand: l.brandId ? brandLabel(l, brands) : "",
    qty: Number(l.qty || 0),
    delivered: Boolean(l.delivered),
    custId: l.custId,
  };
}

// Aggregates the Total view (shared pure builder in lib/breakdowns.js):
// confirmed imports + delivered logs for the viewed date, grouped by
// brand × milk type. Delivery's logs are already date-scoped by the store,
// so no per-log date filter is applied here (preserves historical behavior).

// fallow-ignore-next-line complexity
export default function Delivery({
  logDate,
  onLogDateChange,
  logs = [],
  loading = false,
  onToggleLog,
  generateDailyLogs,
  onOpenModal,
  customers = [],
  imports = [],
  brands = [],
}) {
  const safeLogs = useMemo(() => (Array.isArray(logs) ? logs : []), [logs]);
  const [search, setSearch] = useState("");
  const [activeView, setActiveView] = useState("scheduled"); // scheduled|delivered|skipped|total
  const q = search.trim().toLowerCase();

  const customerMap = useMemo(() => {
    const map = {};
    (customers || []).forEach((c) => {
      map[c.id] = c;
    });
    return map;
  }, [customers]);

  const resolvedLogs = useMemo(
    () => safeLogs.map((l) => resolveLog(l, customerMap, brands)),
    [safeLogs, customerMap, brands],
  );

  const stats = calculateDeliveryStats(safeLogs);

  // Apply search across the active view. For "scheduled" we show all (with
  // toggle). For "delivered" / "skipped" we filter the underlying list, but
  // keep the read-only indicator so the operator can see the current state.
  const visibleLogs = useMemo(() => {
    let list = resolvedLogs;
    if (activeView === "delivered") {
      list = list.filter((l) => l.delivered);
    } else if (activeView === "skipped") {
      list = list.filter((l) => !l.delivered);
    }
    if (!q) return list;
    return list.filter(
      (l) =>
        l.name.toLowerCase().includes(q) ||
        (l.product || "").toLowerCase().includes(q) ||
        (l.brand || "").toLowerCase().includes(q),
    );
  }, [resolvedLogs, activeView, q]);

  const totalBreakdown = useMemo(
    () =>
      buildStockBreakdown({
        imports,
        logs: safeLogs,
        brands,
        date: logDate,
        filterLogsByDate: false,
      }),
    [imports, safeLogs, brands, logDate],
  );

  const statTiles = [
    {
      key: "scheduled",
      label: "Scheduled",
      value: stats.scheduled,
      icon: <CalendarDays size={13} aria-hidden="true" />,
      accent: "var(--brand-500)",
    },
    {
      key: "delivered",
      label: "Delivered",
      value: stats.deliveredCount,
      icon: <CheckCircle2 size={13} aria-hidden="true" />,
      accent: "var(--success-text)",
    },
    {
      key: "skipped",
      label: "Skipped",
      value: stats.skippedCount,
      icon: <XCircle size={13} aria-hidden="true" />,
      accent: "var(--danger-text)",
    },
    {
      key: "total",
      label: "Total",
      value: stats.totalLiters,
      icon: <Droplets size={13} aria-hidden="true" />,
      accent: "var(--info-text)",
    },
  ];

  const [busy, handleGenerate] = useBusy(async () => {
    if (generateDailyLogs) {
      await generateDailyLogs(logDate);
    }
  });

  const goToDate = (next) => {
    if (onLogDateChange && next) onLogDateChange(next);
  };

  return (
    <div className="page-stack">
      <Card>
        <div className="control-bar">
          <div className="date-nav">
            <button
              type="button"
              className="icon-btn square"
              aria-label="Previous day"
              onClick={() => goToDate(shiftDate(logDate, -1))}
            >
              <ChevronLeft size={16} aria-hidden="true" />
            </button>
            <label htmlFor="delivery-date" className="visually-hidden">
              Delivery date
            </label>
            <input
              id="delivery-date"
              name="delivery-date"
              type="date"
              className="input date-input"
              value={logDate || ""}
              onChange={(e) => goToDate(e.target.value)}
            />
            <button
              type="button"
              className="icon-btn square"
              aria-label="Next day"
              onClick={() => goToDate(shiftDate(logDate, 1))}
            >
              <ChevronRight size={16} aria-hidden="true" />
            </button>
            <Btn
              small
              variant="subtle"
              onClick={() => goToDate(getToday())}
              title="Jump to today"
            >
              Today
            </Btn>
          </div>

          <div className="toolbar-actions">
            <Btn onClick={handleGenerate} disabled={busy}>
              {busy ? (
                <>
                  <Loader2 className="spin" size={14} aria-hidden="true" />
                  Generating...
                </>
              ) : (
                <>
                  <Zap size={14} aria-hidden="true" />
                  Generate Deliveries
                </>
              )}
            </Btn>
            <Btn
              variant="secondary"
              onClick={() =>
                // FIX (2026-11-21 audit — AI-D P1-7/AI-L M1): prefill the
                // modal with the VIEWED date. Without it, CustomerDateFields
                // fell back to today, so an extra intended for a historical
                // date was silently recorded on today's date.
                onOpenModal("addAdHoc", { date: logDate })
              }
            >
              + Extra Delivery
            </Btn>
          </div>
        </div>
      </Card>

      {/* Stat tiles — clickable to drive the content below */}
      <div className="stat-grid">
        {statTiles.map((tile) => {
          const isActive = activeView === tile.key;
          return (
            <button
              key={tile.key}
              type="button"
              onClick={() => setActiveView(tile.key)}
              className={`stat-tile ${isActive ? "active" : ""}`}
              aria-pressed={isActive}
              aria-label={`${tile.label}: ${tile.value}`}
              style={{ "--accent": tile.accent, textAlign: "left" }}
            >
              <div className="stat-label">
                {tile.icon} {tile.label}
              </div>
              <div className="stat-value">{tile.value}</div>
            </button>
          );
        })}
      </div>

      {/* Search bar — hidden on the "total" view since it's aggregated */}
      {activeView !== "total" && (
        <div className="search-box">
          <Search size={15} aria-hidden="true" />
          <input
            id="delivery-search"
            name="delivery-search"
            type="search"
            className="input"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by customer or product…"
            aria-label="Search deliveries"
          />
        </div>
      )}

      {/* Content area driven by the active stat tile */}
      {activeView === "total" ? (
        totalBreakdown.rows.length === 0 ? (
          <Empty message="No confirmed imports or delivered logs for this date." />
        ) : (
          <Card>
            <div className="section-head">
              <h3 className="card-head-title">Brand × Milk Type — {logDate}</h3>
              <span className="pill accent tnum">
                {stats.totalLiters} delivered
              </span>
            </div>
            <div style={{ overflowX: "auto" }}>
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Brand</th>
                    <th>Milk Type</th>
                    <th className="num">Imported (L)</th>
                    <th className="num">Delivered (L)</th>
                    <th className="num">Balance (L)</th>
                  </tr>
                </thead>
                <tbody>
                  {totalBreakdown.rows.map((r) => (
                    <tr key={`${r.brand}|${r.type}`}>
                      <td style={{ fontWeight: 600 }}>{r.brand}</td>
                      <td>{r.type}</td>
                      <td className="num">{r.imported.toFixed(1)}</td>
                      <td className="num">{r.delivered.toFixed(1)}</td>
                      <td
                        className="num"
                        style={{
                          color:
                            r.balance >= 0
                              ? "var(--text-primary)"
                              : "var(--danger-text)",
                        }}
                      >
                        {r.balance >= 0 ? "+" : ""}
                        {r.balance.toFixed(1)}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr>
                    <td>Total</td>
                    <td />
                    <td className="num">
                      {totalBreakdown.totals.imported.toFixed(1)}
                    </td>
                    <td className="num">
                      {totalBreakdown.totals.delivered.toFixed(1)}
                    </td>
                    <td className="num">
                      {(
                        totalBreakdown.totals.imported -
                        totalBreakdown.totals.delivered
                      ).toFixed(1)}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </Card>
        )
      ) : loading && safeLogs.length === 0 ? (
        <div className="list" aria-hidden="true">
          {[0, 1, 2].map((i) => (
            <div key={i} className="row">
              <div className="row-main">
                <div
                  className="skeleton"
                  style={{ width: "38%", height: 15 }}
                />
                <div
                  className="skeleton"
                  style={{ width: "55%", height: 12, marginTop: 8 }}
                />
              </div>
              <div
                className="skeleton"
                style={{ width: 92, height: 34, borderRadius: 999 }}
              />
            </div>
          ))}
        </div>
      ) : visibleLogs.length === 0 ? (
        <Empty
          message={
            safeLogs.length === 0
              ? "No deliveries scheduled for this date."
              : q
                ? "No customers match your search."
                : activeView === "delivered"
                  ? "No deliveries marked done yet."
                  : "No deliveries skipped."
          }
        />
      ) : (
        <>
          <div className="list-head">
            <span className="row-sub" style={{ marginTop: 0 }}>
              {visibleLogs.length}{" "}
              {visibleLogs.length === 1 ? "delivery" : "deliveries"}
              {activeView === "scheduled" ? " · tap to flip" : ""}
            </span>
            {activeView !== "scheduled" && (
              <span className="pill">{activeView}</span>
            )}
          </div>
          <div className="list">
            {visibleLogs.map((l) => (
              <DeliveryLogItem
                key={l.id}
                id={l.id}
                name={l.name}
                brand={l.brand}
                product={l.product}
                qty={l.qty}
                delivered={l.delivered}
                onToggle={onToggleLog}
                readOnly={activeView !== "scheduled"}
              />
            ))}
          </div>
        </>
      )}

      {activeView !== "total" && safeLogs.length > 0 && (
        <div className="row-sub" style={{ marginTop: -4 }}>
          <Truck size={13} aria-hidden="true" /> Route for {logDate}
        </div>
      )}
    </div>
  );
}
