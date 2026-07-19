// ── Billing.jsx ───────────────────────────────────────────────────────────────
// Billing tab: month picker + generate + filter chips + KPI tiles + bill cards.

import { fmt } from "../lib/utils.js";
import { BLUE } from "../lib/constants.js";
import {
  Card,
  Btn,
  Field,
  IS,
  Section,
  StatGrid,
  Empty,
  Badge,
} from "../components/ui.jsx";

const STATUS_FILTERS = ["All", "Unpaid", "Partial", "Paid"];

// ✅ Extracted style helper to reduce cognitive complexity in the render tree
const getFilterBtnStyle = (isActive) => ({
  flex: 1,
  padding: "6px 0",
  fontSize: 11,
  fontWeight: 500,
  border: "0.5px solid #e5e7eb",
  borderRadius: 8,
  cursor: "pointer",
  background: isActive ? BLUE : "#fff",
  color: isActive ? "#fff" : "#374151",
});

function renderPaymentButton(bill, onOpenModal) {
  if (!bill.locked && bill.status !== "Paid") {
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
        🔒 Lock
      </Btn>
    );
  }
  if (bill.locked) {
    return (
      <Btn small variant="secondary" onClick={() => onUnlock(bill.id)}>
        🔓 Unlock
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
    <div style={{ display: "flex", gap: 6, marginTop: 10, flexWrap: "wrap" }}>
      {renderPaymentButton(bill, onOpenModal)}
      {renderLockButton(bill, onLock, onUnlock)}
      <Btn
        small
        variant="secondary"
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
  return (
    <Card key={bill.id}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
        }}
      >
        <div>
          <div style={{ fontWeight: 600, fontSize: 14, color: "#111" }}>
            {customerName}
          </div>
          <div style={{ fontSize: 12, color: "#6b7280" }}>
            {bill.month} · Due {bill.due}
          </div>
          <div style={{ fontSize: 13, color: "#374151", marginTop: 4 }}>
            {fmt(bill.paid)} / {fmt(bill.amount)}
          </div>
          {bill.status !== "Paid" && (
            <div style={{ fontSize: 12, color: "#991b1b" }}>
              Pending: {fmt(bill.amount - bill.paid)}
            </div>
          )}
          {bill.locked && (
            <div style={{ fontSize: 11, color: "#6b7280", marginTop: 2 }}>
              🔒 Locked
            </div>
          )}
        </div>
        <Badge label={bill.status} />
      </div>
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
  bills,
  filtered,
  billFilter,
  billMonth,
  pendingDues,
  customers,
  onBillFilterChange,
  onBillMonthChange,
  onOpenModal,
  onGenerateBill,
  onLock,
  onUnlock,
  onWhatsapp,
}) {
  return (
    <div>
      <Section
        title="Billing"
        action={
          <div style={{ display: "flex", gap: 6 }}>
            {/* ✅ FIXED (AI-1 #14): Changed misleading "Generate" label to "Add Credit Note" */}
            <Btn
              small
              variant="secondary"
              onClick={() => onOpenModal("addCreditNote")}
            >
              Add Credit Note
            </Btn>
            <Btn small onClick={() => onGenerateBill()}>
              Generate Bills
            </Btn>
          </div>
        }
      />
      <Field label="Bill Month (for Generate)">
        <input
          type="month"
          value={billMonth}
          onChange={(e) => onBillMonthChange(e.target.value)}
          style={IS()}
        />
      </Field>

      <div style={{ display: "flex", gap: 6, marginBottom: 10 }}>
        {STATUS_FILTERS.map((s) => (
          <button
            key={s}
            onClick={() => onBillFilterChange(s)}
            style={getFilterBtnStyle(billFilter === s)}
          >
            {s}
          </button>
        ))}
      </div>

      <StatGrid
        items={[
          {
            label: "Total Billed",
            value: fmt(bills.reduce((s, b) => s + b.amount, 0)),
            icon: "🧾",
          },
          {
            label: "Collected",
            value: fmt(bills.reduce((s, b) => s + b.paid, 0)),
            icon: "✅",
            bg: "#dcfce7",
            tx: "#166534",
          },
          {
            label: "Pending",
            value: fmt(pendingDues),
            icon: "⏳",
            bg: "#fee2e2",
            tx: "#991b1b",
          },
          { label: "Bills", value: bills.length, icon: "📄" },
        ]}
      />

      {filtered.length === 0 ? (
        <Empty msg="No bills match filter" />
      ) : (
        filtered.map((b) => (
          <BillCard
            key={b.id}
            bill={b}
            customers={customers}
            onOpenModal={onOpenModal}
            onLock={onLock}
            onUnlock={onUnlock}
            onWhatsapp={onWhatsapp}
          />
        ))
      )}
    </div>
  );
}
