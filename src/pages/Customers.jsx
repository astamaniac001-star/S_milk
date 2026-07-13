// ── Customers.jsx ─────────────────────────────────────────────────────────────
// Customers tab: search + status filter + per-customer action card
// (edit / pause / WhatsApp / deactivate).

import { fmt } from "../lib/utils.js";
import { DAYS } from "../lib/constants.js";
import { Card, Btn, IS, Section, Empty, Badge } from "../components/ui.jsx";

const STATUS_FILTERS = ["All", "Active", "Paused", "Inactive"];

export default function Customers({
  filtered,
  total,
  bills,
  search,
  onSearchChange,
  filter,
  onFilterChange,
  onOpenModal,
  onWhatsapp,
  onDeactivate,
}) {
  return (
    <div>
      <Section
        title="Customers"
        action={
          <div style={{ display: "flex", gap: 6 }}>
            <Btn
              small
              variant="secondary"
              onClick={() => onOpenModal("subscriptionsList")}
            >
              Subscriptions
            </Btn>
            <Btn small onClick={() => onOpenModal("addCustomer")}>
              + Add
            </Btn>
          </div>
        }
      />
      <div style={{ display: "flex", gap: 6, marginBottom: 10 }}>
        <input
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder="Search…"
          style={{ ...IS(), flex: 1 }}
        />
        <select
          value={filter}
          onChange={(e) => onFilterChange(e.target.value)}
          style={{ ...IS(), width: 90 }}
        >
          {STATUS_FILTERS.map((s) => (
            <option key={s}>{s}</option>
          ))}
        </select>
      </div>
      <div style={{ fontSize: 12, color: "#6b7280", marginBottom: 8 }}>
        {total} customers
      </div>
      {filtered.length === 0 ? (
        <Empty msg="No customers found" />
      ) : (
        filtered.map((c) => (
          <Card key={c.id}>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "flex-start",
              }}
            >
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 600, fontSize: 14, color: "#111" }}>
                  {c.name}
                </div>
                <div style={{ fontSize: 12, color: "#6b7280", marginTop: 2 }}>
                  📍 {c.address}
                </div>
                <div style={{ fontSize: 12, color: "#6b7280" }}>
                  📞 {c.phone}
                </div>
                <div style={{ fontSize: 12, color: "#374151", marginTop: 4 }}>
                  🥛 {c.qty}L/day · {c.product}
                </div>
                <div style={{ fontSize: 11, color: "#9ca3af", marginTop: 2 }}>
                  {DAYS.filter((_, i) => c.deliveryDays?.includes(i)).join(
                    ", ",
                  ) || "No days set"}
                </div>
                {c.balance < 0 && (
                  <div style={{ fontSize: 12, color: "#991b1b", marginTop: 2 }}>
                    Due: {fmt(Math.abs(c.balance))}
                  </div>
                )}
              </div>
              <Badge label={c.status} />
            </div>
            <div
              style={{
                display: "flex",
                gap: 6,
                marginTop: 10,
                flexWrap: "wrap",
              }}
            >
              <Btn
                small
                variant="secondary"
                onClick={() => onOpenModal("editCustomer", c)}
              >
                Edit
              </Btn>
              {c.status === "Active" && (
                <Btn
                  small
                  variant="secondary"
                  onClick={() => onOpenModal("addPause", { custId: c.id })}
                >
                  Pause
                </Btn>
              )}
              <Btn
                small
                variant="secondary"
                onClick={() => {
                  const b = bills.find(
                    (x) => x.custId === c.id && x.status !== "Paid",
                  );
                  if (b) onWhatsapp(c.phone, b.id);
                }}
              >
                WhatsApp
              </Btn>
              <Btn small variant="danger" onClick={() => onDeactivate(c.id)}>
                Deactivate
              </Btn>
            </div>
          </Card>
        ))
      )}
    </div>
  );
}
