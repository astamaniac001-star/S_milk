// ── Customers.jsx ─────────────────────────────────────────────────────────────
// Customers tab: identity + contact management. Milk type, quantity, and
// delivery schedule live on the Subscriptions tab (multiple per customer);
// each card shows that customer's subscriptions read-only.

import { fmt, dayLabels } from "../lib/utils.js";
import { NEW_SUB_DEFAULTS } from "../lib/constants.js";
import { Card, Btn, IS, Section, Empty, Badge } from "../components/ui.jsx";

const STATUS_FILTERS = ["All", "Active", "Paused", "Inactive"];

function CustomerSubLines({ subs, brands = [] }) {
  if (!subs || subs.length === 0) {
    return (
      <div style={{ fontSize: 12, color: "#9ca3af", marginTop: 4 }}>
        No subscriptions
      </div>
    );
  }
  return (
    <div style={{ marginTop: 4 }}>
      {subs.map((s) => {
        const brand = (brands || []).find((b) => b.id === s.brandId)?.name;
        return (
          <div
            key={s.id}
            style={{
              fontSize: 12,
              color: s.isActive ? "#374151" : "#9ca3af",
              marginTop: 2,
            }}
          >
            🥛 {brand ? `${brand} · ` : ""}
            {s.milkType} · {s.qty ?? 0}L · {dayLabels(s.deliveryDays)}
            {!s.isActive && " (paused)"}
          </div>
        );
      })}
    </div>
  );
}

export default function Customers({
  filtered,
  total,
  bills,
  subsByCustomer = {},
  brands = [],
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
          <Btn small onClick={() => onOpenModal("addCustomer")}>
            + Add
          </Btn>
        }
      />
      <div style={{ display: "flex", gap: 6, marginBottom: 10 }}>
        <input
          id="customer-search"
          name="customer-search"
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder="Search…"
          style={{ ...IS(), flex: 1 }}
        />
        <select
          id="customer-filter"
          name="customer-filter"
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
        filtered.map((c) => {
          const subs = subsByCustomer[c.id] || [];
          return (
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
                  <CustomerSubLines subs={subs} brands={brands} />
                  {c.balance < 0 && (
                    <div
                      style={{ fontSize: 12, color: "#991b1b", marginTop: 2 }}
                    >
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
                    onClick={() =>
                      onOpenModal("addSubscription", {
                        ...NEW_SUB_DEFAULTS,
                        customerId: c.id,
                      })
                    }
                  >
                    + Sub
                  </Btn>
                )}
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
                    onWhatsapp(c.phone, b?.id);
                  }}
                >
                  WhatsApp
                </Btn>
                <Btn
                  small
                  variant="danger"
                  onClick={() => onDeactivate(c)}
                  title={c.version ? `v${c.version}` : undefined}
                >
                  Deactivate
                </Btn>
              </div>
            </Card>
          );
        })
      )}
    </div>
  );
}
