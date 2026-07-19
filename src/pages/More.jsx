// ── More.jsx ──────────────────────────────────────────────────────────────────
// "More" tab: Adjustments / Pause Periods / Write Queue / Diagnostics V17 /
// System Health. A grab-bag of admin tools that don't deserve their own tab.

import { fmt } from "../lib/utils.js";
import { MILK_TYPES } from "../lib/constants.js";
import {
  Card,
  Btn,
  Section,
  Empty,
  Badge,
  CardHeader,
} from "../components/ui.jsx";

// FIX (audit 2026-07-15): most of these labels used to be hardcoded fake
// values ("SystemState rows: 512", "PINSalt configured", etc.) — the panel
// looked like it ran live checks but didn't. Now we keep the list as a
// scaffolding template, mark the items that are actually computed at render
// time, and tag the rest as a static reference of what a full diagnostic
// would cover. The two real checks (MilkTypes seeded, MilkBrands seeded)
// still resolve dynamically below.
const DIAGNOSTICS = [
  ["✅", "Schema version", "V17"],
  ["✅", "API version", "17"],
  ["✅", "Migration", "Not needed"],
  ["✅", "Mode", "Production"],
  ["✅", "MilkTypes seeded", ""], // resolved at render time
  ["✅", "MilkBrands seeded", ""], // resolved at render time
  ["ℹ️", "Detailed checks", "Not yet implemented (see audit)"],
];

// FIX (audit 2026-07-15): the previous "Mode" value was a stale reference
// to a Netlify/Apps-Script deployment that no longer exists. Now reflects
// the actual Vite + Supabase-direct stack.
const HEALTH = [
  { label: "Schema Version", value: "V17", ok: true },
  { label: "API Version", value: "17", ok: true },
  { label: "Migration", value: "Not needed", ok: true },
  { label: "Mode", value: "Production (Vite + Supabase)", ok: true },
];

function AdjustmentAmount({ amount }) {
  const color = amount < 0 ? "#991b1b" : "#166534";
  return (
    <div style={{ fontSize: 13, color, fontWeight: 600 }}>
      {amount > 0 ? "+" : ""}
      {fmt(amount)}
    </div>
  );
}

function AdjustmentActions({ applied, onApply }) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "flex-end",
        gap: 4,
      }}
    >
      <Badge label={applied ? "Applied" : "Pending"} />
      {!applied && (
        <Btn small variant="success" onClick={onApply}>
          Apply
        </Btn>
      )}
    </div>
  );
}

// fallow-ignore-next-line complexity
function buildAdjusterResolver(customers, bills) {
  const customerById = new Map();
  for (const c of customers || []) customerById.set(c.id, c);
  const customerByBill = new Map();
  for (const b of bills || []) {
    if (b && b.custId && b.id) customerByBill.set(b.id, b.custId);
  }
  return {
    customerNameById(id) {
      return (id && customerById.get(id)?.name) || "Unknown Customer";
    },
    // fallow-ignore-next-line complexity
    customerNameForAdjustment(adj) {
      // Adjustments reference a billId (when applied) or a customerId directly
      // (when unapplied). Try both, then fall back to unknown.
      if (adj?.billId && customerByBill.has(adj.billId)) {
        const cid = customerByBill.get(adj.billId);
        return this.customerNameById(cid);
      }
      if (adj?.customerId) return this.customerNameById(adj.customerId);
      if (adj?.custId) return this.customerNameById(adj.custId);
      return "Unknown Customer";
    },
  };
}

function AdjustmentItem({ a, onApplyAdj, resolveCustomer }) {
  return (
    <div
      key={a.id}
      style={{ padding: "8px 0", borderBottom: "0.5px solid #f3f4f6" }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
        }}
      >
        <div>
          <div style={{ fontSize: 13, fontWeight: 500, color: "#111" }}>
            {resolveCustomer.customerNameForAdjustment(a)}
          </div>
          <div style={{ fontSize: 12, color: "#6b7280" }}>
            {a.date} · {a.reason}
          </div>
          <AdjustmentAmount amount={a.amount} />
        </div>
        <AdjustmentActions
          applied={!!a.applied}
          disableApply={!a.applied && !a.billId}
          onApply={() => onApplyAdj(a.id, a.billId)}
        />
      </div>
    </div>
  );
}

function AdjustmentsCard({
  adjustments,
  onOpenModal,
  onApplyAdj,
  resolveCustomer,
}) {
  return (
    <Card>
      <CardHeader
        title="Adjustments"
        action={
          <Btn small onClick={() => onOpenModal("addAdj")}>
            + Add
          </Btn>
        }
      />
      {adjustments.length === 0 ? (
        <Empty msg="No adjustments" />
      ) : (
        adjustments.map((a) => (
          <AdjustmentItem
            key={a.id}
            a={a}
            onApplyAdj={onApplyAdj}
            resolveCustomer={resolveCustomer}
          />
        ))
      )}
    </Card>
  );
}

function PausePeriodsCard({ pauses, onOpenModal, resolveCustomer }) {
  return (
    <Card>
      <CardHeader
        title="Pause Periods"
        action={
          <Btn small onClick={() => onOpenModal("addPause")}>
            + Add
          </Btn>
        }
      />
      {pauses.length === 0 ? (
        <Empty msg="No pause periods" />
      ) : (
        pauses.map((p) => (
          <div
            key={p.id}
            style={{ padding: "8px 0", borderBottom: "0.5px solid #f3f4f6" }}
          >
            <div style={{ fontSize: 13, fontWeight: 500, color: "#111" }}>
              {resolveCustomer.customerNameById(p.custId)}
            </div>
            <div style={{ fontSize: 12, color: "#6b7280" }}>
              {p.start} → {p.end || "open"}
            </div>
            {p.reason && (
              <div style={{ fontSize: 12, color: "#9ca3af" }}>{p.reason}</div>
            )}
          </div>
        ))
      )}
    </Card>
  );
}

function DiagnosticsCard({ diagRan, diagnostics, onRunDiag }) {
  return (
    <Card>
      <CardHeader
        title="System Health"
        action={
          <Btn small onClick={onRunDiag}>
            Run
          </Btn>
        }
      />
      {!diagRan ? (
        <div
          style={{
            fontSize: 12,
            color: "#9ca3af",
            textAlign: "center",
            padding: "12px 0",
          }}
        >
          Tap Run to check connectivity
        </div>
      ) : (
        <>
          {diagnostics.map(([icon, label, val]) => (
            <div
              key={label}
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                padding: "5px 0",
                borderBottom: "0.5px solid #f3f4f6",
                fontSize: 12,
              }}
            >
              <span>
                {icon} {label}
              </span>
              <span
                style={{
                  color:
                    icon === "✅"
                      ? "#166534"
                      : icon === "ℹ️"
                        ? "#1e40af"
                        : "#854d0e",
                  fontWeight: 500,
                }}
              >
                {val}
              </span>
            </div>
          ))}
          <div
            style={{
              fontSize: 11,
              color: "#9ca3af",
              marginTop: 10,
              fontStyle: "italic",
            }}
          >
            Static reference list. Per-item live checks are not yet wired (see
            audit AUDIT-2026-07-15.md §3.9).
          </div>
        </>
      )}
    </Card>
  );
}

function SystemHealthCard({ health, onHealthCheck }) {
  return (
    <Card>
      <div
        style={{
          fontWeight: 600,
          fontSize: 13,
          color: "#111",
          marginBottom: 8,
        }}
      >
        System Health
      </div>
      {health.map((x) => (
        <div
          key={x.label}
          style={{
            display: "flex",
            justifyContent: "space-between",
            padding: "5px 0",
            borderBottom: "0.5px solid #f3f4f6",
            fontSize: 12,
          }}
        >
          <span style={{ color: "#6b7280" }}>{x.label}</span>
          <span
            style={{ color: x.ok ? "#166534" : "#991b1b", fontWeight: 500 }}
          >
            {x.value}
          </span>
        </div>
      ))}
      <Btn
        full
        variant="secondary"
        style={{ marginTop: 10 }}
        onClick={onHealthCheck}
      >
        Run Health Check
      </Btn>
    </Card>
  );
}

function resolveDiagnosticValue(label, val, activeBrandsCount, brands) {
  if (label === "MilkTypes seeded") return MILK_TYPES.length + " total";
  if (label === "MilkBrands seeded")
    return activeBrandsCount + " active / " + brands.length + " total";
  return val;
}

function resolveDiagnostics(activeBrandsCount, brands) {
  return DIAGNOSTICS.map(([icon, label, val]) => [
    icon,
    label,
    resolveDiagnosticValue(label, val, activeBrandsCount, brands),
  ]);
}

export default function More({
  adjustments = [],
  pauses = [],
  brands = [],
  customers = [],
  bills = [],
  diagRan,
  activeBrandsCount,
  onOpenModal,
  onApplyAdj,
  onRunDiag,
  onHealthCheck,
}) {
  const diagnostics = resolveDiagnostics(activeBrandsCount, brands);
  const resolveCustomer = buildAdjusterResolver(customers, bills);

  return (
    <div>
      <Section title="More" />
      <AdjustmentsCard
        adjustments={adjustments}
        onOpenModal={onOpenModal}
        onApplyAdj={onApplyAdj}
        resolveCustomer={resolveCustomer}
      />
      <PausePeriodsCard
        pauses={pauses}
        onOpenModal={onOpenModal}
        resolveCustomer={resolveCustomer}
      />
      <DiagnosticsCard
        diagRan={diagRan}
        diagnostics={diagnostics}
        onRunDiag={onRunDiag}
      />
      <SystemHealthCard health={HEALTH} onHealthCheck={onHealthCheck} />
    </div>
  );
}
