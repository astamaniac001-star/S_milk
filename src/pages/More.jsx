// ── More.jsx ──────────────────────────────────────────────────────────────────
// "More" tab — the operator's back office: Security / Adjustments / Credit
// Notes / Pause Periods / Diagnostics / System Health.

import { useState } from "react";
import { fmt } from "../lib/utils.js";
import {
  Card,
  Btn,
  Section,
  Empty,
  Badge,
  CardHeader,
} from "../components/ui.jsx";
import {
  Activity,
  CheckCircle2,
  HeartPulse,
  PauseCircle,
  ShieldCheck,
  SlidersHorizontal,
  Ticket,
  XCircle,
} from "lucide-react";

// FIX (AI-m audit M-4, 2026-08-01): HEALTH was a static reference list that
// never updated when the "Run Health Check" button was clicked — the toast
// succeeded but the displayed list stayed stale. Now the card starts blank
// and gets populated from the live `healthCheck` RPC response on click.
function defaultHealth() {
  return [{ label: "Database", value: "Not checked", ok: null }];
}

function buildHealthFromResult(previous, result) {
  // Preserve static reference labels so the row list doesn't flicker on
  // every probe — only the Database row flips to the live value.
  const base = previous ?? defaultHealth();
  const live = Array.isArray(result?.checks) ? result.checks : null;
  if (!live) {
    return base.map((row) =>
      row.label === "Database"
        ? { ...row, value: result?.status ?? "OK", ok: true }
        : row,
    );
  }
  return base.map((row) => {
    const probe = live.find((c) => c.label === row.label);
    if (!probe) return row;
    return { label: probe.label, value: probe.value ?? "OK", ok: !!probe.ok };
  });
}

function AdjustmentAmount({ amount }) {
  // Sign contract matches apply_adjustment_rpc (schema.sql): a POSITIVE
  // adjustment amount is a deduction — it REDUCES the bill the customer
  // owes (a credit in the customer's favor), hence the green "+".
  // A negative amount adds to the bill (extra charge) and renders red.
  return (
    <div className={`ledger-amount tnum ${amount < 0 ? "neg" : "pos"}`}>
      {amount > 0 ? "+" : ""}
      {fmt(amount)}
    </div>
  );
}

function AdjustmentActions({ applied, onApply }) {
  return (
    <div className="ledger-side">
      <Badge label={applied ? "Applied" : "Pending"} />
      {!applied && (
        <Btn small variant="success" onClick={onApply}>
          Apply
        </Btn>
      )}
    </div>
  );
}

// FIX (2026-11-21 audit — AI-L H1): credit notes could be issued from the
// Billing page but were never listed or applied anywhere — a note could
// never reduce a bill from the UI. This card mirrors the Adjustments card:
// list, badge, and an Apply action that resolves the target bill (the note's
// stored billId, or the viewed month's bill for that customer).
function CreditNoteItem({ cn, onApplyCn, resolveCustomer, targetBillId }) {
  return (
    <div className="ledger-row">
      <div className="ledger-main">
        <div className="ledger-title">
          {resolveCustomer.customerNameById(cn.customerId)}
        </div>
        <div className="ledger-sub">
          {cn.date || "—"} · {cn.reason}
        </div>
        <div className="ledger-amount tnum pos">{fmt(cn.amount)}</div>
        {!cn.applied && !targetBillId && (
          <div className="ledger-hint">
            No {cn.date?.substring(0, 7) || "current"}-month bill found for
            this customer yet — generate bills first.
          </div>
        )}
      </div>
      {/* Hide Apply entirely when no target bill can be resolved — a
          silent no-op button (the old adjustment behavior AI-L flagged)
          teaches operators that Apply is broken. */}
      {cn.applied || targetBillId ? (
        <AdjustmentActions
          applied={!!cn.applied}
          onApply={() => {
            if (
              window.confirm(
                `Apply this credit note to the ${cn.date?.substring(0, 7) || "current"}-month bill? This action is irreversible.`,
              )
            ) {
              onApplyCn(cn.id, targetBillId, cn.version);
            }
          }}
        />
      ) : (
        <div className="ledger-side">
          <Badge label="Pending" />
        </div>
      )}
    </div>
  );
}

function CreditNotesCard({
  creditNotes,
  bills,
  billMonth,
  onOpenModal,
  onApplyCn,
  resolveCustomer,
}) {
  // Resolve each note's apply target up front so the Apply button state is
  // honest: stored billId wins; otherwise the viewed month's bill.
  const targets = new Map();
  for (const cn of creditNotes || []) {
    if (cn.applied) continue;
    const bill =
      (cn.billId && bills.find((b) => b.id === cn.billId)) ||
      bills.find((b) => b.custId === cn.customerId && b.month === billMonth);
    if (bill) targets.set(cn.id, bill.id);
  }
  return (
    <Card>
      <CardHeader
        title="Credit Notes"
        icon={Ticket}
        action={
          <Btn small onClick={() => onOpenModal("addCreditNote")}>
            + Add
          </Btn>
        }
      />
      {creditNotes.length === 0 ? (
        <Empty msg="No credit notes" icon={Ticket} />
      ) : (
        creditNotes.map((cn) => (
          <CreditNoteItem
            key={cn.id}
            cn={cn}
            onApplyCn={onApplyCn}
            resolveCustomer={resolveCustomer}
            targetBillId={targets.get(cn.id)}
          />
        ))
      )}
    </Card>
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
    <div className="ledger-row" key={a.adjustmentId || a.id}>
      <div className="ledger-main">
        <div className="ledger-title">
          {resolveCustomer.customerNameForAdjustment(a)}
        </div>
        <div className="ledger-sub">
          {a.date} · {a.reason}
        </div>
        <AdjustmentAmount amount={a.amount} />
      </div>
      <AdjustmentActions
        applied={!!a.applied}
        onApply={() => {
          if (!a.billId) return;
          if (
            window.confirm(
              `Apply adjustment to this bill? This action is irreversible.`,
            )
          ) {
            onApplyAdj(a.adjustmentId || a.id, a.billId, a.version);
          }
        }}
      />
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
        icon={SlidersHorizontal}
        action={
          <Btn small onClick={() => onOpenModal("addAdj")}>
            + Add
          </Btn>
        }
      />
      {adjustments.length === 0 ? (
        <Empty msg="No adjustments" icon={SlidersHorizontal} />
      ) : (
        adjustments.map((a) => (
          <AdjustmentItem
            key={a.adjustmentId || a.id}
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
        icon={PauseCircle}
        action={
          <Btn small onClick={() => onOpenModal("addPause")}>
            + Add
          </Btn>
        }
      />
      {pauses.length === 0 ? (
        <Empty msg="No pause periods" icon={PauseCircle} />
      ) : (
        pauses.map((p) => (
          <div className="ledger-row" key={p.id}>
            <div className="ledger-main">
              <div className="ledger-title">
                {resolveCustomer.customerNameById(p.custId)}
              </div>
              <div className="ledger-sub">
                {p.start} → {p.end || "open"}
              </div>
              {p.reason && <div className="ledger-sub dim">{p.reason}</div>}
            </div>
          </div>
        ))
      )}
    </Card>
  );
}

// Security Card for PIN Rotation
function SecurityCard({ onOpenModal }) {
  return (
    <Card>
      <CardHeader title="Security" icon={ShieldCheck} />
      <div className="security-body">
        <span className="security-icon" aria-hidden="true">
          <ShieldCheck size={20} />
        </span>
        <div>
          <div className="ledger-title">Operator PIN</div>
          <div className="ledger-sub">
            Secured via Supabase Auth. Rotate regularly for safety.
          </div>
        </div>
      </div>
      <div className="card-actions">
        <Btn full variant="secondary" onClick={() => onOpenModal("changePin")}>
          Change PIN
        </Btn>
      </div>
    </Card>
  );
}

function DiagnosticsCard({ diagRan, diagResults, onRunDiag }) {
  return (
    <Card>
      <CardHeader
        title="Diagnostics"
        icon={Activity}
        action={
          <Btn small onClick={onRunDiag}>
            Run
          </Btn>
        }
      />
      {!diagRan || !diagResults ? (
        <div className="diag-placeholder">Tap Run to check connectivity</div>
      ) : (
        <>
          {Object.entries(diagResults.probes || {}).map(([label, p]) => (
            <div className="diag-row" key={label}>
              <span className="diag-label">
                {p?.ok ? (
                  <CheckCircle2
                    className="diag-ok"
                    size={12}
                    aria-hidden="true"
                  />
                ) : (
                  <XCircle className="diag-bad" size={12} aria-hidden="true" />
                )}
                {label}
              </span>
              <span className={`diag-value ${p?.ok ? "ok" : "bad"}`}>
                {p?.value}
                {p?.detail ? ` — ${p.detail}` : ""}
              </span>
            </div>
          ))}
          {!diagResults.ok && diagResults.error && (
            <div className="diag-error">{diagResults.error}</div>
          )}
        </>
      )}
    </Card>
  );
}

function SystemHealthCard({ onHealthCheck }) {
  // FIX (AI-m audit M-4, 2026-08-01): previously the displayed list was a
  // static constant and never updated when "Run Health Check" was clicked.
  // Now the card owns its own state, starts blank, and refreshes from the
  // live `healthCheck` RPC response on click.
  const [rows, setRows] = useState([
    { label: "Database", value: "Not checked", ok: null },
  ]);
  const [running, setRunning] = useState(false);

  const run = async () => {
    if (running) return;
    setRunning(true);
    try {
      const result = await onHealthCheck();
      // FIX (audit M-4): guard against null. On failure the handler returns
      // null and toasts an error — we must NOT call buildHealthFromResult
      // with null because its `result?.status ?? "OK"` fallback would
      // misleadingly flip the Database row to "OK" while the toast says
      // "error". Leaving `rows` untouched keeps the card on "Not checked",
      // which is coherent with the error toast.
      if (result) setRows((prev) => buildHealthFromResult(prev, result));
    } finally {
      setRunning(false);
    }
  };

  return (
    <Card>
      <CardHeader title="System Health" icon={HeartPulse} />
      {rows.map((x) => (
        <div className="diag-row" key={x.label}>
          <span className="diag-label muted">{x.label}</span>
          <span
            className={`diag-value ${
              x.ok === null ? "muted" : x.ok ? "ok" : "bad"
            }`}
          >
            {x.value}
          </span>
        </div>
      ))}
      <div className="card-actions">
        <Btn full variant="secondary" onClick={run} disabled={running}>
          {running ? "Checking..." : "Run Health Check"}
        </Btn>
      </div>
    </Card>
  );
}

export default function More({
  adjustments = [],
  creditNotes = [],
  pauses = [],
  customers = [],
  bills = [],
  billMonth,
  diagRan,
  diagResults,
  onOpenModal,
  onApplyAdj,
  onApplyCn,
  onRunDiag,
  onHealthCheck,
}) {
  const resolveCustomer = buildAdjusterResolver(customers, bills);

  return (
    <div className="page-stack">
      <Section title="Admin Tools" />

      {/* Ops row: security + the two live-probe cards */}
      <div className="more-grid more-grid-3">
        <SecurityCard onOpenModal={onOpenModal} />
        <DiagnosticsCard
          diagRan={diagRan}
          diagResults={diagResults}
          onRunDiag={onRunDiag}
        />
        <SystemHealthCard onHealthCheck={onHealthCheck} />
      </div>

      {/* Ledger row: the three correction registries */}
      <div className="more-grid more-grid-2">
        <AdjustmentsCard
          adjustments={adjustments}
          onOpenModal={onOpenModal}
          onApplyAdj={onApplyAdj}
          resolveCustomer={resolveCustomer}
        />
        <CreditNotesCard
          creditNotes={creditNotes}
          bills={bills}
          billMonth={billMonth}
          onOpenModal={onOpenModal}
          onApplyCn={onApplyCn}
          resolveCustomer={resolveCustomer}
        />
        <PausePeriodsCard
          pauses={pauses}
          onOpenModal={onOpenModal}
          resolveCustomer={resolveCustomer}
        />
      </div>
    </div>
  );
}
