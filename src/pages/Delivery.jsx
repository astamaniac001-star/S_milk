// ── Delivery.jsx ──────────────────────────────────────────────────────────────
import { useMemo } from "react";
import { useBusy } from "../hooks/useBusy.js";
import { Card, Field, IS, StatGrid, Empty, Btn } from "../components/ui.jsx";

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
    // FIX M8: Use CSS variables for dark mode support
    background: delivered ? "var(--success-bg, #dcfce7)" : "var(--danger-bg, #fee2e2)",
    border: "none",
    borderRadius: 8,
    // FIX M11: Increased padding to ensure minimum 44x44 touch target for mobile
    padding: "12px 16px",
    fontSize: 14,
    fontWeight: 600,
    cursor: "pointer",
    color: delivered ? "var(--success-text, #166534)" : "var(--danger-text, #991b1b)",
    minWidth: "90px",
    textAlign: "center",
    transition: "opacity 0.2s",
  };
}

function getToggleButtonText(delivered) {
  return delivered ? "✓ Done" : "✗ Skip";
}

function DeliveryLogItem({ id, name, product, qty, delivered, onToggle }) {
  return (
    // FIX M9: Replaced Tailwind classes with inline flex styles
    <div style={{
      display: "flex",
      justifyContent: "space-between",
      alignItems: "center",
      padding: "12px 0",
      borderBottom: "1px solid var(--border-color, #e5e7eb)"
    }}>
      <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
        {/* FIX M8: Use CSS variables for text colors to support Dark Mode */}
        <span style={{ fontWeight: 600, color: "var(--text-main, #111827)" }}>
          {name}
        </span>
        <span style={{ fontSize: 14, color: "var(--text-muted, #6b7280)" }}>
          {product} · {qty}L
        </span>
      </div>
      <button
        onClick={() => onToggle(id, !delivered)}
        style={getToggleButtonStyle(delivered)}
        aria-label={`Mark ${name} as ${delivered ? 'skipped' : 'delivered'}`}
      >
        {getToggleButtonText(delivered)}
      </button>
    </div>
  );
}

function resolveLog(l, customerMap) {
  const c = customerMap[l.custId];
  return {
    id: l.id,
    name: c?.name ?? "Unknown Customer",
    product: l.product ?? c?.product ?? "Milk",
    qty: Number(l.qty || 0),
    delivered: Boolean(l.delivered),
  };
}

export default function Delivery({
  logDate,
  onLogDateChange,
  logs = [], // FIX H5: Renamed from todayLogs to logs to reflect it holds the selected date's data
  onToggleLog,
  generateDailyLogs,
  onOpenModal,
  customers = [],
}) {
  const safeLogs = useMemo(
    () => (Array.isArray(logs) ? logs : []),
    [logs],
  );

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

  const statItems = [
    { label: "Scheduled", value: stats.scheduled, icon: "📅" },
    { label: "Delivered", value: stats.deliveredCount, icon: "✅" },
    { label: "Skipped", value: stats.skippedCount, icon: "❌" },
    { label: "Total", value: stats.totalLiters, icon: "🥛" },
  ];

  // FIX H5: Removed redundant fetchLogs useEffect. 
  // The parent (AppPage/useEntityStore) now handles fetching when logDate changes, preventing race conditions.

  const [busy, handleGenerate] = useBusy(async () => {
    if (generateDailyLogs) {
      await generateDailyLogs(logDate);
    }
  });

  return (
    // FIX M9: Replaced undefined Tailwind classes with inline flex styles
    <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
      <Card>
        <div style={{
          display: "flex",
          flexDirection: "column",
          gap: "12px",
          alignItems: "flex-end"
        }}>
          <Field label="Date" style={{ flex: 1, width: "100%" }}>
            <input
              type="date"
              value={logDate}
              onChange={(e) => onLogDateChange(e.target.value)}
              style={{ ...IS(), width: "100%" }}
            />
          </Field>

          <div style={{
            display: "flex",
            gap: "8px",
            flexWrap: "wrap",
            width: "100%",
            justifyContent: "flex-end"
          }}>
            <Btn
              onClick={handleGenerate}
              disabled={busy}
              style={{ flex: "1 1 auto", minWidth: "150px" }}
            >
              {busy ? "⏳ Generating..." : "⚡ Generate Deliveries"}
            </Btn>
            <Btn
              onClick={() => onOpenModal("addAdHoc")}
              style={{ whiteSpace: "nowrap", flex: "0 0 auto" }}
            >
              + Extra Delivery
            </Btn>
          </div>
        </div>
      </Card>

      <StatGrid items={statItems} />

      {safeLogs.length === 0 ? (
        <Empty message="No deliveries scheduled for this date." />
      ) : (
        <Card>
          <div style={{ display: "flex", flexDirection: "column" }}>
            {resolvedLogs.map((l) => (
              <DeliveryLogItem
                key={l.id}
                id={l.id}
                name={l.name}
                product={l.product}
                qty={l.qty}
                delivered={l.delivered}
                onToggle={onToggleLog}
              />
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}