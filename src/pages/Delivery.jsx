// ── Delivery.jsx ──────────────────────────────────────────────────────────────
import { useEffect, useMemo } from "react";
import { useBusy } from "../hooks/useBusy.js";
import { Card, Field, IS, StatGrid, Empty, Btn } from "../components/ui.jsx";

function calculateDeliveryStats(todayLogs) {
  const logs = Array.isArray(todayLogs) ? todayLogs : [];
  const delivered = logs.filter((l) => l.delivered);
  return {
    scheduled: logs.length,
    deliveredCount: delivered.length,
    skippedCount: logs.filter((l) => !l.delivered).length,
    totalLiters:
      delivered.reduce((s, l) => s + Number(l.qty || 0), 0).toFixed(1) + " L",
  };
}

function getToggleButtonStyle(delivered) {
  return {
    background: delivered ? "#dcfce7" : "#fee2e2",
    border: "none",
    borderRadius: 8,
    padding: "4px 10px",
    fontSize: 12,
    fontWeight: 500,
    cursor: "pointer",
    color: delivered ? "#166534" : "#991b1b",
  };
}

function getToggleButtonText(delivered) {
  return delivered ? "✓ Done" : "✗ Skip";
}

function DeliveryLogItem({ id, name, product, qty, delivered, onToggle }) {
  return (
    <div className="flex justify-between items-center p-3 border-b last:border-b-0">
      <div className="flex flex-col">
        <span className="font-semibold text-gray-800">{name}</span>
        <span className="text-sm text-gray-600">
          {product} · {qty}L
        </span>
      </div>
      <button
        onClick={() => onToggle(id, !delivered)}
        style={getToggleButtonStyle(delivered)}
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
  todayLogs = [],
  onToggleLog,
  fetchLogs,
  generateDailyLogs,
  onOpenModal,
  customers = [],
}) {
  const safeLogs = useMemo(
    () => (Array.isArray(todayLogs) ? todayLogs : []),
    [todayLogs],
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

  // 🔥 FIX: Convert the stats object into the items array format that StatGrid expects!
  const statItems = [
    { label: "Scheduled", value: stats.scheduled, icon: "📅" },
    { label: "Delivered", value: stats.deliveredCount, icon: "✅" },
    { label: "Skipped", value: stats.skippedCount, icon: "❌" },
    { label: "Total", value: stats.totalLiters, icon: "🥛" },
  ];

  useEffect(() => {
    if (logDate && fetchLogs) {
      fetchLogs(logDate);
    }
  }, [logDate, fetchLogs]);

  const [busy, handleGenerate] = useBusy(async () => {
    if (generateDailyLogs) {
      await generateDailyLogs(logDate);
    }
  });

  return (
    <div className="space-y-4">
      <Card>
        <div className="flex flex-col sm:flex-row gap-3 items-end">
          <Field label="Date" className="flex-1">
            <input
              type="date"
              value={logDate}
              onChange={(e) => onLogDateChange(e.target.value)}
              style={IS()}
            />
          </Field>

          <div className="flex gap-2 flex-wrap">
            <Btn
              onClick={handleGenerate}
              disabled={busy}
              className="flex-1 sm:flex-none"
            >
              {busy ? "⏳ Generating..." : "⚡ Generate Deliveries"}
            </Btn>
            <Btn
              onClick={() => onOpenModal("addAdHoc")}
              style={{ whiteSpace: "nowrap" }}
            >
              + Extra Delivery
            </Btn>
          </div>
        </div>
      </Card>

      {/* 🔥 FIX: Pass the array 'statItems' instead of the object 'stats' */}
      <StatGrid items={statItems} />

      {safeLogs.length === 0 ? (
        <Empty message="No deliveries scheduled for this date." />
      ) : (
        <Card>
          <div className="space-y-2">
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
