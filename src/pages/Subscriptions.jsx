// ── Subscriptions.jsx ─────────────────────────────────────────────────────────
// Subscriptions tab: manage per-customer milk subscriptions (multiple per
// customer). Add/Edit use the shared SubscriptionModal; History uses
// SubscriptionHistoryModal — all already wired in AppModals.

import { useMemo, useState } from "react";
import { dayLabels } from "../lib/utils.js";
import { NEW_SUB_DEFAULTS } from "../lib/constants.js";
import { Card, Btn, IS, Section, Empty, Badge } from "../components/ui.jsx";

const SUB_FILTERS = ["All", "Active", "Paused"];

function resolveCustomerName(customers, customerId) {
  if (!customerId) return "Unknown Customer";
  const c = customers.find((cu) => cu.id === customerId);
  return c?.name || "Unknown Customer";
}

// fallow-ignore-next-line complexity
export default function Subscriptions({
  subscriptions = [],
  customers = [],
  brands = [],
  search = "",
  onSearchChange,
  filter = "All",
  onFilterChange,
  onOpenModal,
  onDelete,
}) {
  const [deletingId, setDeletingId] = useState(null);
  const q = (search || "").trim().toLowerCase();

  const customerMap = useMemo(() => {
    const m = new Map(customers.map((c) => [c.id, c]));
    return m;
  }, [customers]);

  const brandMap = useMemo(() => {
    return new Map(brands.map((b) => [b.id, b]));
  }, [brands]);

  const filtered = useMemo(() => {
    return subscriptions
      .filter((s) => {
        if (filter === "Active") return s.isActive;
        if (filter === "Paused") return !s.isActive;
        return true;
      })
      .filter((s) => {
        if (!q) return true;
        const name = resolveCustomerName(customers, s.customerId).toLowerCase();
        const milk = (s.milkType || "").toLowerCase();
        const brand = (brandMap.get(s.brandId)?.name || "").toLowerCase();
        return name.includes(q) || milk.includes(q) || brand.includes(q);
      })
      .sort((a, b) => {
        const an = resolveCustomerName(customers, a.customerId);
        const bn = resolveCustomerName(customers, b.customerId);
        return an === bn
          ? (a.milkType || "").localeCompare(b.milkType || "")
          : an.localeCompare(bn);
      });
  }, [subscriptions, customers, brandMap, filter, q]);

  const activeCount = subscriptions.filter((s) => s.isActive).length;

  const handleDelete = async (sub) => {
    if (deletingId) return; // busy guard
    const name = resolveCustomerName(customers, sub.customerId);
    if (!window.confirm(`Delete subscription for ${name}? This cannot be undone.`))
      return;
    setDeletingId(sub.id);
    try {
      await onDelete(sub);
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div>
      <Section
        title="Subscriptions"
        action={
          <Btn small onClick={() => onOpenModal("addSubscription", NEW_SUB_DEFAULTS)}>
            + Add
          </Btn>
        }
      />
      <div style={{ display: "flex", gap: 6, marginBottom: 10 }}>
        <input
          id="subscription-search"
          name="subscription-search"
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder="Search by customer, brand or milk type…"
          style={{ ...IS(), flex: 1 }}
        />
        <select
          id="subscription-filter"
          name="subscription-filter"
          value={filter}
          onChange={(e) => onFilterChange(e.target.value)}
          style={{ ...IS(), width: 100 }}
        >
          {SUB_FILTERS.map((f) => (
            <option key={f}>{f}</option>
          ))}
        </select>
      </div>
      <div style={{ fontSize: 12, color: "#6b7280", marginBottom: 8 }}>
        {filtered.length} subscription(s) · {activeCount} active
      </div>
      {filtered.length === 0 ? (
        <Empty
          msg={
            subscriptions.length === 0
              ? 'No subscriptions yet. Click "Add" to create one.'
              : "No subscriptions match your search."
          }
        />
      ) : (
        filtered.map((sub) => (
          <Card key={sub.id}>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "flex-start",
              }}
            >
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 600, fontSize: 14, color: "#111" }}>
                  {customerMap.get(sub.customerId)?.name || "Unknown Customer"}
                </div>
                <div style={{ fontSize: 12, color: "#6b7280", marginTop: 2 }}>
                  🥛 {brandMap.get(sub.brandId)?.name || "No brand"} ·{" "}
                  {sub.milkType} · {sub.qty ?? 0}L/day
                </div>
                <div style={{ fontSize: 11, color: "#9ca3af", marginTop: 2 }}>
                  {dayLabels(sub.deliveryDays)}
                </div>
              </div>
              <Badge label={sub.isActive ? "Active" : "Paused"} />
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
                onClick={() => onOpenModal("editSubscription", sub)}
              >
                Edit
              </Btn>
              <Btn
                small
                variant="secondary"
                onClick={() => onOpenModal("subscriptionHistory", sub)}
              >
                History
              </Btn>
              <Btn
                small
                variant="danger"
                disabled={deletingId === sub.id}
                title={sub.version ? `v${sub.version}` : undefined}
                onClick={() => handleDelete(sub)}
              >
                {deletingId === sub.id ? "…" : "Delete"}
              </Btn>
            </div>
          </Card>
        ))
      )}
    </div>
  );
}
