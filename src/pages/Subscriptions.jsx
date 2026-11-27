// ── Subscriptions.jsx ─────────────────────────────────────────────────────────
// Subscriptions tab: manage per-customer milk subscriptions (multiple per
// customer). Add/Edit use the shared SubscriptionModal; History uses
// SubscriptionHistoryModal — all already wired in AppModals.

import { useMemo, useState } from "react";
import { dayLabels } from "../lib/utils.js";
import { NEW_SUB_DEFAULTS } from "../lib/constants.js";
import {
  Card,
  Btn,
  Section,
  Empty,
  Badge,
  Toolbar,
  SearchInput,
  ChipRow,
  Skeleton,
} from "../components/ui.jsx";
import { Repeat, Milk, Pencil, History, Trash2 } from "lucide-react";

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
  loading = false,
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
  const statusCounts = {
    All: subscriptions.length,
    Active: activeCount,
    Paused: subscriptions.length - activeCount,
  };

  const handleDelete = async (sub) => {
    if (deletingId) return; // busy guard
    const name = resolveCustomerName(customers, sub.customerId);
    if (
      !window.confirm(`Delete subscription for ${name}? This cannot be undone.`)
    )
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
          <Btn
            small
            onClick={() => onOpenModal("addSubscription", NEW_SUB_DEFAULTS)}
          >
            + Add
          </Btn>
        }
      />

      <Toolbar>
        <SearchInput
          id="subscription-search"
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder="Search by customer, brand or milk type…"
          label="Search subscriptions"
        />
      </Toolbar>

      <div style={{ marginBottom: 10 }}>
        <ChipRow
          options={SUB_FILTERS}
          value={filter}
          onChange={onFilterChange}
          counts={statusCounts}
          ariaLabel="Filter subscriptions by status"
        />
      </div>

      <div className="row-sub" style={{ marginBottom: 10 }}>
        {filtered.length} subscription(s) · {activeCount} active
      </div>

      {loading && subscriptions.length === 0 ? (
        <div className="list" aria-hidden="true">
          {[0, 1, 2].map((i) => (
            <Card key={i}>
              <Skeleton w="40%" h={16} />
              <div style={{ height: 10 }} />
              <Skeleton w="65%" h={12} />
              <div style={{ height: 6 }} />
              <Skeleton w="45%" h={11} />
              <div style={{ height: 14 }} />
              <Skeleton w="85%" h={32} radius={8} />
            </Card>
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <Empty
          msg={
            subscriptions.length === 0
              ? 'No subscriptions yet. Click "Add" to create one.'
              : "No subscriptions match your search."
          }
          icon={Repeat}
        />
      ) : (
        <div className="list">
          {filtered.map((sub) => {
            const brandName = brandMap.get(sub.brandId)?.name || "No brand";
            return (
              <Card key={sub.id}>
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "flex-start",
                    gap: 10,
                  }}
                >
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="row-title">
                      {customerMap.get(sub.customerId)?.name ||
                        "Unknown Customer"}
                    </div>
                    <div className="row-sub" style={{ marginTop: 3 }}>
                      <Milk size={12} aria-hidden="true" />
                      {`${brandName} · ${sub.milkType} · ${sub.qty ?? 0}L/day`}
                    </div>
                    <div
                      className="row-sub"
                      style={{ fontSize: 11, marginTop: 3 }}
                    >
                      {dayLabels(sub.deliveryDays)}
                    </div>
                  </div>
                  <Badge label={sub.isActive ? "Active" : "Paused"} />
                </div>

                <div
                  className="row-actions"
                  style={{ marginTop: 12, justifyContent: "flex-start" }}
                >
                  <Btn
                    small
                    variant="secondary"
                    onClick={() => onOpenModal("editSubscription", sub)}
                  >
                    <Pencil size={13} aria-hidden="true" /> Edit
                  </Btn>
                  <Btn
                    small
                    variant="secondary"
                    onClick={() => onOpenModal("subscriptionHistory", sub)}
                  >
                    <History size={13} aria-hidden="true" /> History
                  </Btn>
                  <Btn
                    small
                    variant="danger"
                    disabled={deletingId === sub.id}
                    title={sub.version ? `v${sub.version}` : undefined}
                    onClick={() => handleDelete(sub)}
                  >
                    <Trash2 size={13} aria-hidden="true" />{" "}
                    {deletingId === sub.id ? "…" : "Delete"}
                  </Btn>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
