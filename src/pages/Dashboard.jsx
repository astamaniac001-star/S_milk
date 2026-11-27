import {
  Card,
  StatGrid,
  Btn,
  Section,
  Empty,
  Badge,
  ProgressRing,
  Skeleton,
} from "../components/ui.jsx";
import {
  UserPlus,
  Users,
  Package,
  Receipt,
  Scale,
  PauseCircle,
  Tag,
  ArrowRight,
  CheckCircle,
  XCircle,
  Droplet,
} from "lucide-react";
import { fmt } from "../lib/utils.js";

const MONTH_NAMES = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

const QUICK_ACTIONS = [
  { label: "Add Customer", icon: UserPlus, type: "addCustomer" },
  { label: "Add Import", icon: Package, type: "addImport" },
  { label: "Generate Bills", icon: Receipt, type: "generate" },
  { label: "Adjustment", icon: Scale, type: "addAdj" },
  { label: "Add Pause", icon: PauseCircle, type: "addPause" },
  { label: "Add Brand", icon: Tag, type: "addBrand" },
];

function monthLabel(YYYYMM) {
  if (!YYYYMM || typeof YYYYMM !== "string" || YYYYMM.length < 7) return YYYYMM;
  const monthIdx = Number(YYYYMM.substring(5, 7)) - 1;
  if (Number.isNaN(monthIdx) || monthIdx < 0 || monthIdx > 11) return YYYYMM;
  return MONTH_NAMES[monthIdx];
}

function openBillDetail(onOpenModal, bill) {
  if (onOpenModal) onOpenModal("billDetail", bill);
}

export default function Dashboard({
  today,
  todayLogs = [],
  bills = [],
  customers = [],
  activeC = [],
  totalRevenue = 0,
  pendingDues = 0,
  confirmedStock = 0,
  loading = false,
  onSetTab,
  onOpenModal,
  onGenerateBill,
}) {
  const customerName = (() => {
    const m = new Map();
    for (const c of customers) m.set(c.id, c.name);
    return (id) => m.get(id) || "Unknown Customer";
  })();

  const deliveredCount = todayLogs.filter((l) => l.delivered).length;
  const skippedCount = todayLogs.filter((l) => !l.delivered).length;
  const totalLiters = todayLogs
    .filter((l) => l.delivered)
    .reduce((s, l) => s + (l.qty || 0), 0)
    .toFixed(1);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      {/* KPIs — computed from the VIEWED bill month's bills (revenue/dues)
          and today's delivered logs (stock). Labels are contract-stable. */}
      <StatGrid
        items={[
          {
            label: "Active Customers",
            value: activeC.length,
            icon: <Users size={16} aria-hidden="true" />,
            accent: "var(--info-text)",
          },
          {
            label: "Collected (month)",
            value: fmt(totalRevenue),
            icon: <CheckCircle size={16} aria-hidden="true" />,
            accent: "var(--success-text)",
          },
          {
            label: "Pending Dues (month)",
            value: fmt(pendingDues),
            icon: <XCircle size={16} aria-hidden="true" />,
            accent: "var(--danger-text)",
          },
          {
            label: "Delivered Today (L)",
            value: `${Number(confirmedStock).toFixed(1)} L`,
            icon: <Droplet size={16} aria-hidden="true" />,
            accent: "var(--brand-500)",
          },
        ]}
      />

      <Card>
        <div className="section-head">
          <h2 className="card-head-title">Today's Delivery ({today})</h2>
          <Btn small variant="ghost" onClick={() => onSetTab("delivery")}>
            View Log <ArrowRight size={14} />
          </Btn>
        </div>

        <div className="chart-wrap" style={{ marginBottom: 14 }}>
          <ProgressRing
            value={deliveredCount}
            max={todayLogs.length}
            size={84}
            label={`${deliveredCount} of ${todayLogs.length} deliveries completed`}
          />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="row-title">Route progress</div>
            <div className="row-sub">
              {deliveredCount} of {todayLogs.length} deliveries completed
            </div>
            <div className="row-sub tnum">
              {totalLiters} L delivered · {skippedCount} skipped
            </div>
          </div>
        </div>

        <StatGrid
          items={[
            {
              label: "Delivered",
              value: deliveredCount,
              icon: <CheckCircle size={16} aria-hidden="true" />,
              accent: "var(--success-text)",
            },
            {
              label: "Skipped",
              value: skippedCount,
              icon: <XCircle size={16} aria-hidden="true" />,
              accent: "var(--danger-text)",
            },
            {
              label: "Total (L)",
              value: `${totalLiters} L`,
              icon: <Droplet size={16} aria-hidden="true" />,
              accent: "var(--brand-500)",
            },
          ]}
        />
      </Card>

      <Section title="Quick Actions">
        <div className="quick-actions">
          {QUICK_ACTIONS.map((q) => {
            const Icon = q.icon;
            return (
              <button
                key={q.label}
                type="button"
                className="quick-action-btn"
                onClick={() => {
                  if (q.type === "generate") {
                    const currentMonth = (today || "").substring(0, 7);
                    if (
                      window.confirm(
                        `Generate bills for ${currentMonth}? This will create or update a bill for every customer with active subscriptions.`,
                      )
                    )
                      // FIX (2026-11-21 audit — AI-S M1): pass the confirmed
                      // month explicitly so the dialog text and handler
                      // target can't diverge.
                      onGenerateBill(currentMonth);
                  } else {
                    onOpenModal(q.type);
                  }
                }}
              >
                <Icon size={20} aria-hidden="true" />
                <span>{q.label}</span>
              </button>
            );
          })}
        </div>
      </Section>

      <Card>
        <div className="section-head">
          <h2 className="card-head-title">Recent Bills</h2>
          <Btn variant="ghost" small onClick={() => onSetTab("billing")}>
            View all <ArrowRight size={14} />
          </Btn>
        </div>

        {loading && bills.length === 0 ? (
          <div className="list" aria-hidden="true">
            {[0, 1, 2].map((i) => (
              <div key={i} className="row">
                <div className="row-main">
                  <Skeleton w="38%" h={15} />
                  <div style={{ height: 8 }} />
                  <Skeleton w="55%" h={12} />
                </div>
                <Skeleton w={70} h={26} radius={999} />
              </div>
            ))}
          </div>
        ) : bills.slice(0, 3).length === 0 ? (
          <Empty
            message="No bills generated yet."
            hint="Generate a month from Quick Actions to see bills here."
          />
        ) : (
          <div className="list">
            {bills.slice(0, 3).map((b) => (
              <div
                key={b.id}
                className="row"
                role="button"
                tabIndex={0}
                style={{ cursor: "pointer" }}
                aria-label={`Open bill for ${customerName(b.custId)} — ${monthLabel(b.month)}`}
                onClick={() => openBillDetail(onOpenModal, b)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    openBillDetail(onOpenModal, b);
                  }
                }}
              >
                <div className="row-main">
                  <div className="row-title">{customerName(b.custId)}</div>
                  <div className="row-sub tnum">
                    {monthLabel(b.month)} · {fmt(b.paid)} paid
                  </div>
                </div>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    flexShrink: 0,
                  }}
                >
                  <span className="amount" style={{ fontWeight: 700 }}>
                    {fmt(b.amount)}
                  </span>
                  <Badge label={b.status} />
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
