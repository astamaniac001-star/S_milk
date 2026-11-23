// ── Delivery.jsx ──────────────────────────────────────────────────────────────
import { useMemo, useState } from "react";
import { useBusy } from "../hooks/useBusy.js";
import { brandLabel } from "../lib/utils.js";
import { Card, Field, IS, Empty, Btn } from "../components/ui.jsx";

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

function getToggleButtonStyle(delivered) {
  return {
    background: delivered
      ? "var(--success-bg, #dcfce7)"
      : "var(--danger-bg, #fee2e2)",
    border: "none",
    borderRadius: 8,
    padding: "12px 16px",
    fontSize: 14,
    fontWeight: 600,
    cursor: "pointer",
    color: delivered
      ? "var(--success-text, #166534)"
      : "var(--danger-text, #991b1b)",
    minWidth: "90px",
    textAlign: "center",
    transition: "opacity 0.2s",
  };
}

function getToggleButtonText(delivered) {
  return delivered ? "✓ Done" : "✗ Skip";
}

function DeliveryLogItem({
  id,
  name,
  product,
  qty,
  delivered,
  onToggle,
  readOnly,
}) {
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        padding: "12px 0",
        borderBottom: "1px solid var(--border-color, #e5e7eb)",
      }}
    >
      <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
        <span style={{ fontWeight: 600, color: "var(--text-main, #111827)" }}>
          {name}
        </span>
        <span style={{ fontSize: 14, color: "var(--text-muted, #6b7280)" }}>
          {product} · {qty}L
        </span>
      </div>
      {readOnly ? (
        <div
          style={{
            ...getToggleButtonStyle(delivered),
            cursor: "default",
            opacity: 0.85,
          }}
        >
          {getToggleButtonText(delivered)}
        </div>
      ) : (
        <button
          onClick={() => onToggle(id, !delivered)}
          style={getToggleButtonStyle(delivered)}
          aria-label={`Mark ${name} as ${delivered ? "skipped" : "delivered"}`}
        >
          {getToggleButtonText(delivered)}
        </button>
      )}
    </div>
  );
}

function resolveLog(l, customerMap) {
  const c = customerMap[l.custId];
  return {
    id: l.id,
    name: c?.name ?? "Unknown Customer",
    // product lives on the log row (subscription-centric model); the legacy
    // customers.product column is deprecated and never mapped — audit
    // 2026-11-09 removed the dead `c?.product` reference.
    product: l.product ?? "Milk",
    qty: Number(l.qty || 0),
    delivered: Boolean(l.delivered),
    custId: l.custId,
  };
}

// Aggregates the Total view: group imports and delivered logs by brand x milk
// type so the operator sees how much of each brand/type was bought vs delivered
// on the selected date. `imports` are deliveries from milk_brands (UI shape:
// {brand, type, qty, date}); `logs` are customer deliveries for the day.
function buildTotalBreakdown(imports, logs, brands, logDate) {
  const dayImports = (imports || []).filter(
    (i) => i.status === "Confirmed" && i.date === logDate,
  );

  // Build brand → { milkType → { imported, delivered } }
  const brandMap = new Map();

  const ensureBrand = (brandName) => {
    if (!brandMap.has(brandName)) brandMap.set(brandName, new Map());
    return brandMap.get(brandName);
  };

  const ensureMilk = (brandMapEntry, milkType) => {
    if (!brandMapEntry.has(milkType)) {
      brandMapEntry.set(milkType, { imported: 0, delivered: 0 });
    }
    return brandMapEntry.get(milkType);
  };

  // 1. Imports per brand/type
  dayImports.forEach((imp) => {
    if (!imp.brand) return;
    const milkType = imp.type || "Mixed";
    const m = ensureMilk(ensureBrand(imp.brand), milkType);
    m.imported += Number(imp.qty || 0);
  });

  // 2. Delivered logs — brand-aware: a log's brandId resolves the brand
  // directly; legacy/unbranded rows fall back to the milk-type heuristic
  // (matchBrandByMilkType inside brandLabel). Unresolvable → "Unknown brand".
  const deliveredLogs = (logs || []).filter((l) => l.delivered);
  deliveredLogs.forEach((l) => {
    const milkType = l.product || "Milk";
    const brandName = brandLabel(l, brands);
    const m = ensureMilk(ensureBrand(brandName), milkType);
    m.delivered += Number(l.qty || 0);
  });

  // Flatten to a sorted list of rows
  const rows = [];
  for (const [brandName, milkEntries] of brandMap.entries()) {
    for (const [milkType, agg] of milkEntries.entries()) {
      rows.push({
        brand: brandName,
        milkType,
        imported: agg.imported,
        delivered: agg.delivered,
        balance: agg.imported - agg.delivered,
      });
    }
  }
  // Stable sort: brand name, then milk type
  rows.sort((a, b) =>
    a.brand === b.brand
      ? a.milkType.localeCompare(b.milkType)
      : a.brand.localeCompare(b.brand),
  );

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

// fallow-ignore-next-line complexity
export default function Delivery({
  logDate,
  onLogDateChange,
  logs = [],
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
    () => safeLogs.map((l) => resolveLog(l, customerMap)),
    [safeLogs, customerMap],
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
        (l.product || "").toLowerCase().includes(q),
    );
  }, [resolvedLogs, activeView, q]);

  const totalBreakdown = useMemo(
    () => buildTotalBreakdown(imports, safeLogs, brands, logDate),
    [imports, safeLogs, brands, logDate],
  );

  const statTiles = [
    {
      key: "scheduled",
      label: "Scheduled",
      value: stats.scheduled,
      icon: "📅",
      bg: "var(--bg-surface)",
    },
    {
      key: "delivered",
      label: "Delivered",
      value: stats.deliveredCount,
      icon: "✅",
      bg: "var(--success-bg, #ecfdf5)",
    },
    {
      key: "skipped",
      label: "Skipped",
      value: stats.skippedCount,
      icon: "❌",
      bg: "var(--danger-bg, #fef2f2)",
    },
    {
      key: "total",
      label: "Total",
      value: stats.totalLiters,
      icon: "🥛",
      bg: "var(--info-bg, #eef2ff)",
    },
  ];

  const [busy, handleGenerate] = useBusy(async () => {
    if (generateDailyLogs) {
      await generateDailyLogs(logDate);
    }
  });

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
      <Card>
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: "12px",
            alignItems: "flex-end",
          }}
        >
          <Field label="Date" style={{ flex: 1, width: "100%" }}>
            <input
              type="date"
              value={logDate}
              onChange={(e) => onLogDateChange(e.target.value)}
              style={{ ...IS(), width: "100%" }}
            />
          </Field>

          <div
            style={{
              display: "flex",
              gap: "8px",
              flexWrap: "wrap",
              width: "100%",
              justifyContent: "flex-end",
            }}
          >
            <Btn
              onClick={handleGenerate}
              disabled={busy}
              style={{ flex: "1 1 auto", minWidth: "150px" }}
            >
              {busy ? "⏳ Generating..." : "⚡ Generate Deliveries"}
            </Btn>
            <Btn
              onClick={() =>
                // FIX (2026-11-21 audit — AI-D P1-7/AI-L M1): prefill the
                // modal with the VIEWED date. Without it, CustomerDateFields
                // fell back to today, so an extra intended for a historical
                // date was silently recorded on today's date.
                onOpenModal("addAdHoc", { date: logDate })
              }
              style={{ whiteSpace: "nowrap", flex: "0 0 auto" }}
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
              className="stat-tile"
              aria-pressed={isActive}
              aria-label={`${tile.label}: ${tile.value}`}
              style={{
                background: tile.bg || "var(--bg-surface)",
                border: isActive
                  ? "2px solid var(--brand-600, #4f46e5)"
                  : "1px solid var(--border-color)",
                cursor: "pointer",
                boxShadow: isActive
                  ? "0 0 0 2px rgb(99 102 241 / 0.25)"
                  : "none",
                textAlign: "left",
              }}
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
        <input
          id="delivery-search"
          name="delivery-search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by customer or product…"
          style={{ ...IS() }}
        />
      )}

      {/* Content area driven by the active stat tile */}
      {activeView === "total" ? (
        totalBreakdown.rows.length === 0 ? (
          <Empty message="No confirmed imports or delivered logs for this date." />
        ) : (
          <Card>
            <div
              style={{
                fontWeight: 600,
                fontSize: 14,
                marginBottom: 8,
                color: "var(--text-main)",
              }}
            >
              Brand × Milk Type — {logDate}
            </div>
            <div style={{ overflowX: "auto" }}>
              <table
                style={{
                  width: "100%",
                  borderCollapse: "collapse",
                  fontSize: 13,
                  color: "var(--text-main)",
                }}
              >
                <thead>
                  <tr
                    style={{
                      borderBottom: "2px solid var(--border-color)",
                      textAlign: "left",
                    }}
                  >
                    <th style={{ padding: "8px 6px" }}>Brand</th>
                    <th style={{ padding: "8px 6px" }}>Milk Type</th>
                    <th style={{ padding: "8px 6px", textAlign: "right" }}>
                      Imported (L)
                    </th>
                    <th style={{ padding: "8px 6px", textAlign: "right" }}>
                      Delivered (L)
                    </th>
                    <th style={{ padding: "8px 6px", textAlign: "right" }}>
                      Balance (L)
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {totalBreakdown.rows.map((r) => (
                    <tr
                      key={`${r.brand}|${r.milkType}`}
                      style={{
                        borderBottom: "1px solid var(--border-color)",
                      }}
                    >
                      <td style={{ padding: "8px 6px", fontWeight: 600 }}>
                        {r.brand}
                      </td>
                      <td style={{ padding: "8px 6px" }}>{r.milkType}</td>
                      <td style={{ padding: "8px 6px", textAlign: "right" }}>
                        {r.imported.toFixed(1)}
                      </td>
                      <td style={{ padding: "8px 6px", textAlign: "right" }}>
                        {r.delivered.toFixed(1)}
                      </td>
                      <td
                        style={{
                          padding: "8px 6px",
                          textAlign: "right",
                          color:
                            r.balance >= 0 ? "var(--text-main)" : "#991b1b",
                          fontWeight: 600,
                        }}
                      >
                        {r.balance >= 0 ? "+" : ""}
                        {r.balance.toFixed(1)}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr
                    style={{
                      borderTop: "2px solid var(--border-color)",
                      fontWeight: 700,
                    }}
                  >
                    <td style={{ padding: "10px 6px" }}>Total</td>
                    <td style={{ padding: "10px 6px" }} />
                    <td style={{ padding: "10px 6px", textAlign: "right" }}>
                      {totalBreakdown.totals.imported.toFixed(1)}
                    </td>
                    <td style={{ padding: "10px 6px", textAlign: "right" }}>
                      {totalBreakdown.totals.delivered.toFixed(1)}
                    </td>
                    <td style={{ padding: "10px 6px", textAlign: "right" }}>
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
        <Card>
          <div style={{ display: "flex", flexDirection: "column" }}>
            {visibleLogs.map((l) => (
              <DeliveryLogItem
                key={l.id}
                id={l.id}
                name={l.name}
                product={l.product}
                qty={l.qty}
                delivered={l.delivered}
                onToggle={onToggleLog}
                readOnly={activeView !== "scheduled"}
              />
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}
