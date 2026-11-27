// ── Billing.jsx ───────────────────────────────────────────────────────────────
// Billing tab: month picker + generate + search/status filters + KPI tiles +
// bill cards (payment, lock/unlock, WhatsApp share, detail view).

import { fmt } from "../lib/utils.js";
import {
  Card,
  Btn,
  Field,
  Section,
  StatGrid,
  Empty,
  Badge,
  SearchInput,
  Skeleton,
} from "../components/ui.jsx";
import {
  ReceiptText,
  Wallet,
  AlertCircle,
  FileText,
  Lock,
  LockOpen,
} from "lucide-react";

const STATUS_FILTERS = ["All", "Unpaid", "Partial", "Paid", "Draft"];

const SORT_OPTIONS = [
  { value: "newest", label: "Newest month" },
  { value: "due", label: "Highest due" },
  // Label must not contain "customer": Playwright's getByLabel matcher text
  // for a <select> includes its option texts, and the e2e suite drives modals
  // with unscoped getByLabel(/Customer/i) — an option named "Customer name"
  // made that locator resolve to two controls (live e2e failure 2026-11-26).
  { value: "name", label: "Name (A-Z)" },
];

function renderPaymentButton(bill, onOpenModal) {
  // FIX (2026-11-21 audit — AI-D P2-8): Draft bills must not be payable.
  // `pendingDues` deliberately excludes Draft (bills not yet finalized), so
  // allowing a payment on Draft made the KPI and the card disagree — and a
  // payment could land on an unfinalized bill.
  if (!bill.locked && bill.status !== "Paid" && bill.status !== "Draft") {
    return (
      <Btn small onClick={() => onOpenModal("payment", bill)}>
        Record Payment
      </Btn>
    );
  }
  return null;
}

function renderLockButton(bill, onLock, onUnlock) {
  if (!bill.locked && bill.status === "Paid") {
    return (
      <Btn small variant="secondary" onClick={() => onLock(bill.id)}>
        <Lock size={12} aria-hidden="true" /> Lock
      </Btn>
    );
  }
  if (bill.locked) {
    return (
      <Btn small variant="secondary" onClick={() => onUnlock(bill.id)}>
        <LockOpen size={12} aria-hidden="true" /> Unlock
      </Btn>
    );
  }
  return null;
}

function BillActions({
  bill,
  customer,
  onOpenModal,
  onLock,
  onUnlock,
  onWhatsapp,
}) {
  return (
    <div className="row-actions" style={{ marginTop: 12 }}>
      {renderPaymentButton(bill, onOpenModal)}
      {renderLockButton(bill, onLock, onUnlock)}
      <Btn
        small
        variant="secondary"
        disabled={!customer}
        onClick={() => {
          if (customer) onWhatsapp(customer.phone, bill.id);
        }}
      >
        WhatsApp
      </Btn>
      <Btn
        small
        variant="secondary"
        onClick={() => onOpenModal("billDetail", bill)}
      >
        View
      </Btn>
    </div>
  );
}

function BillCard({
  bill,
  customers,
  onOpenModal,
  onLock,
  onUnlock,
  onWhatsapp,
}) {
  const customer = customers.find((c) => c.id === bill.custId);
  const customerName = customer ? customer.name : "Unknown Customer";
  const amount = Number(bill.amount || 0);
  const paid = Number(bill.paid || 0);
  const pending = amount - paid;
  const pct = amount > 0 ? Math.min(100, Math.round((paid / amount) * 100)) : 0;

  return (
    <Card>
      <div className="bill-head">
        <div className="row-main">
          <div className="row-title">{customerName}</div>
          <div className="row-sub tnum">{bill.month}</div>
        </div>
        <Badge label={bill.status} />
      </div>

      <div className="bill-money">
        <div className="bill-money-cell">
          <span className="bill-money-label">Paid</span>
          <span className="bill-money-value tnum">{fmt(paid)}</span>
        </div>
        <div className="bill-money-cell">
          <span className="bill-money-label">Billed</span>
          <span className="bill-money-value tnum">{fmt(amount)}</span>
        </div>
        {bill.status !== "Paid" && bill.status !== "Draft" && (
          <div className="bill-money-cell">
            <span className="bill-money-label">Pending</span>
            <span className="bill-money-value pending tnum">
              {fmt(pending)}
            </span>
          </div>
        )}
      </div>

      <div className="bill-progress" aria-hidden="true">
        <div style={{ width: `${pct}%` }} />
      </div>

      {bill.locked && (
        <div className="row-sub">
          <Lock size={11} aria-hidden="true" /> Locked
        </div>
      )}

      <BillActions
        bill={bill}
        customer={customer}
        onOpenModal={onOpenModal}
        onLock={onLock}
        onUnlock={onUnlock}
        onWhatsapp={onWhatsapp}
      />
    </Card>
  );
}

export default function Billing({
  bills = [],
  filtered = [],
  loading = false,
  billFilter = "All",
  billSearch = "",
  billSort = "newest",
  billMonth,
  pendingDues = 0,
  customers = [],
  onBillFilterChange,
  onBillSearchChange,
  onBillSortChange,
  onBillMonthChange,
  onOpenModal,
  onGenerateBill,
  onLock,
  onUnlock,
  onWhatsapp,
}) {
  const statusCounts = { All: bills.length };
  for (const s of STATUS_FILTERS) {
    if (s !== "All") statusCounts[s] = 0;
  }
  for (const b of bills) {
    if (statusCounts[b.status] !== undefined) statusCounts[b.status] += 1;
  }

  return (
    <div>
      <Section
        title="Billing"
        action={
          <div className="toolbar-actions">
            {/* ✅ FIXED (AI-1 #14): Changed misleading "Generate" label to "Add Credit Note" */}
            <Btn
              small
              variant="secondary"
              onClick={() => onOpenModal("addCreditNote")}
            >
              Add Credit Note
            </Btn>
            <Btn
              small
              onClick={() => {
                if (
                  window.confirm(
                    `Generate bills for ${billMonth}? This will create or update a bill for every customer with active subscriptions.`,
                  )
                ) {
                  onGenerateBill();
                }
              }}
            >
              Generate Bills
            </Btn>
          </div>
        }
      />

      <Card>
        <div className="billing-controls">
          <Field label="Bill Month (for Generate)">
            {/* Deliberately <input type="month"> (audit 2026-11-09 revisit): the
                operator must be able to target ANY month — including months with
                no bills yet — and month-scoped refetches key off this value. A
                data-derived <select> (like the Imports filter) cannot offer
                arbitrary months. On Firefox/old WebViews this degrades to a text
                field the operator can type YYYY-MM into. */}
            <input
              type="month"
              id="bill-month"
              name="bill-month"
              className="input"
              value={billMonth || ""}
              onChange={(e) => onBillMonthChange(e.target.value)}
            />
          </Field>

          <div className="billing-search">
            <SearchInput
              id="bill-search"
              value={billSearch}
              onChange={(e) => onBillSearchChange(e.target.value)}
              placeholder="Search by customer, month or status…"
              label="Search bills"
            />
          </div>

          <label className="field billing-sort">
            <span className="field-label">Sort</span>
            <select
              id="bill-sort"
              name="bill-sort"
              className="input"
              value={billSort}
              onChange={(e) => onBillSortChange(e.target.value)}
            >
              {SORT_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div
          className="chip-row"
          role="group"
          aria-label="Filter bills by status"
        >
          {STATUS_FILTERS.map((s) => {
            const active = billFilter === s;
            return (
              <button
                key={s}
                type="button"
                className={`chip ${active ? "active" : ""}`}
                aria-pressed={active}
                aria-label={s}
                onClick={() => onBillFilterChange(s)}
              >
                {s}
                <span className="chip-count" aria-hidden="true">
                  {statusCounts[s]}
                </span>
              </button>
            );
          })}
        </div>
      </Card>

      <StatGrid
        items={[
          {
            label: "Total Billed",
            value: fmt(bills.reduce((s, b) => s + Number(b.amount || 0), 0)),
            icon: <ReceiptText size={13} aria-hidden="true" />,
            accent: "var(--brand-500)",
          },
          {
            label: "Collected",
            value: fmt(bills.reduce((s, b) => s + Number(b.paid || 0), 0)),
            icon: <Wallet size={13} aria-hidden="true" />,
            accent: "var(--success-text)",
          },
          {
            label: "Pending",
            value: fmt(pendingDues),
            icon: <AlertCircle size={13} aria-hidden="true" />,
            accent: "var(--danger-text)",
          },
          {
            label: "Bills",
            value: bills.length,
            icon: <FileText size={13} aria-hidden="true" />,
            accent: "var(--info-text)",
          },
        ]}
      />

      <div className="row-sub" style={{ margin: "10px 0" }}>
        {filtered.length} of {bills.length} bill(s)
        {billSearch ? " · search active" : ""}
      </div>

      {loading && bills.length === 0 ? (
        <div className="list" aria-hidden="true">
          {[0, 1, 2].map((i) => (
            <Card key={i}>
              <Skeleton w="42%" h={16} />
              <div style={{ height: 10 }} />
              <Skeleton w="68%" h={12} />
              <div style={{ height: 12 }} />
              <Skeleton w="100%" h={8} radius={999} />
              <div style={{ height: 12 }} />
              <Skeleton w="80%" h={32} radius={8} />
            </Card>
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <Empty
          msg="No bills match filter"
          icon={ReceiptText}
          hint={
            bills.length > 0
              ? "Try another status or clear the search."
              : "Generate a month to create bills."
          }
        />
      ) : (
        <div className="list">
          {filtered.map((b) => (
            <BillCard
              key={b.id}
              bill={b}
              customers={customers}
              onOpenModal={onOpenModal}
              onLock={onLock}
              onUnlock={onUnlock}
              onWhatsapp={onWhatsapp}
            />
          ))}
        </div>
      )}
    </div>
  );
}
