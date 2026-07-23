import {
  Card,
  StatGrid,
  Btn,
  Section,
  Empty,
  Badge,
} from "../components/ui.jsx";
import {
  UserPlus,
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

export default function Dashboard({
  today,
  todayLogs = [],
  bills = [],
  customers = [],
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
    // FIX M9: Replaced undefined Tailwind classes (space-y-6) with inline flex styles
    <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
      <Card>
        <h2
          style={{
            fontSize: 18,
            fontWeight: 600,
            marginBottom: 16,
            color: "var(--text-main)",
          }}
        >
          Today's Delivery ({today})
        </h2>

        {/* FIX M10: Moved "View Log" to the new action prop on StatGrid */}
        <StatGrid
          items={[
            {
              label: "Delivered",
              value: deliveredCount,
              icon: (
                <CheckCircle
                  size={20}
                  style={{ color: "var(--success-text)" }}
                />
              ),
            },
            {
              label: "Skipped",
              value: skippedCount,
              icon: (
                <XCircle size={20} style={{ color: "var(--danger-text)" }} />
              ),
            },
            {
              label: "Total (L)",
              value: `${totalLiters} L`,
              icon: <Droplet size={20} style={{ color: "var(--info-text)" }} />,
            },
          ]}
          action={
            <Btn small variant="ghost" onClick={() => onSetTab("delivery")}>
              View Log <ArrowRight size={14} style={{ marginLeft: 4 }} />
            </Btn>
          }
        />
      </Card>

      <Section title="Quick Actions">
        {/* FIX M9: Replaced grid-cols-2 md:grid-cols-3 with responsive auto-fit grid */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))",
            gap: "12px",
          }}
        >
          {QUICK_ACTIONS.map((q) => {
            const Icon = q.icon;
            return (
              <Btn
                key={q.label}
                variant="secondary"
                onClick={() =>
                  q.type === "generate" ? onGenerateBill() : onOpenModal(q.type)
                }
                style={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  gap: 8,
                  padding: "16px 8px",
                }}
              >
                <Icon size={20} />
                <span style={{ fontSize: 13, fontWeight: 500 }}>{q.label}</span>
              </Btn>
            );
          })}
        </div>
      </Section>

      <Card>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: 16,
          }}
        >
          <h2
            style={{ fontSize: 18, fontWeight: 600, color: "var(--text-main)" }}
          >
            Recent Bills
          </h2>
          <Btn variant="ghost" small onClick={() => onSetTab("billing")}>
            View all <ArrowRight size={14} style={{ marginLeft: 4 }} />
          </Btn>
        </div>

        {bills.slice(0, 3).length === 0 ? (
          <Empty message="No bills generated yet." />
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
            {bills.slice(0, 3).map((b) => (
              <div
                key={b.id}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  padding: 12,
                  background: "var(--bg-muted)", // FIX M8: Dark mode aware background
                  borderRadius: 8,
                }}
              >
                <div>
                  <p
                    style={{
                      fontWeight: 500,
                      color: "var(--text-main)",
                      margin: 0,
                    }}
                  >
                    {customerName(b.custId)}
                  </p>
                  <p
                    style={{
                      fontSize: 14,
                      color: "var(--text-muted)",
                      margin: "4px 0 0 0",
                    }}
                  >
                    {monthLabel(b.month)}
                  </p>
                </div>

                {/* FIX M10: Badge only accepts 'label' for status colors. Render amount as text. */}
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <span style={{ fontWeight: 600, color: "var(--text-main)" }}>
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
