import { useMemo, useState } from "react";
import { Modal, Btn, IS } from "../ui.jsx";
import { DAYS_OF_WEEK } from "./shared";

function resolveCustomerName(customers, customerId) {
  if (!customerId) return "Unknown Customer";
  const c = customers?.find((cu) => cu.id === customerId);
  return c?.name || "Unknown Customer";
}

// fallow-ignore-next-line complexity
export function SubscriptionsListModal({
  subscriptions,
  customers = [],
  onEdit,
  onViewHistory,
  onDelete,
  onClose,
}) {
  const [search, setSearch] = useState("");
  const [deletingId, setDeletingId] = useState(null);
  const q = search.trim().toLowerCase();

  const filtered = useMemo(() => {
    if (!q) return subscriptions;
    return subscriptions.filter((sub) => {
      const name = resolveCustomerName(customers, sub.customerId).toLowerCase();
      const milk = (sub.milkType || "").toLowerCase();
      return name.includes(q) || milk.includes(q);
    });
  }, [subscriptions, customers, q]);

  const handleDelete = async (sub) => {
    if (!onDelete) return;
    const name = resolveCustomerName(customers, sub.customerId);
    if (
      !window.confirm(
        `Delete subscription for ${name}? This cannot be undone.`,
      )
    )
      return;
    if (deletingId) return; // busy guard
    setDeletingId(sub.id);
    try {
      await onDelete({ id: sub.id, version: sub.version });
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <Modal title="Manage Subscriptions" onClose={onClose} wide>
      <div
        style={{
          marginBottom: 12,
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <span style={{ fontSize: 13, color: "#6b7280" }}>
          {filtered.length} of {subscriptions.length} subscription(s)
        </span>
        <Btn small onClick={() => onEdit(null)}>
          + Add Subscription
        </Btn>
      </div>
      <input
        id="subscription-search"
        name="subscription-search"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Search by customer or milk type…"
        style={{ ...IS(), marginBottom: 10 }}
      />
      <div style={{ maxHeight: 400, overflowY: "auto" }}>
        {filtered.length === 0 ? (
          <div
            style={{
              padding: 20,
              textAlign: "center",
              color: "#9ca3af",
              fontSize: 13,
            }}
          >
            {subscriptions.length === 0
              ? 'No subscriptions yet. Click "Add Subscription" to create one.'
              : "No subscriptions match your search."}
          </div>
        ) : (
          // fallow-ignore-next-line complexity
          filtered.map((sub) => (
            <div
              key={sub.id}
              style={{
                padding: "10px 0",
                borderBottom: "0.5px solid #f3f4f6",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
              }}
            >
              <div>
                <div style={{ fontSize: 13, fontWeight: 600, color: "#111" }}>
                  {resolveCustomerName(customers, sub.customerId)}
                </div>
                 <div style={{ fontSize: 12, color: "#6b7280", marginTop: 2 }}>
                   {sub.milkType} • {sub.qty ?? 0}L •{" "}
                  {(Array.isArray(sub.deliveryDays) ? sub.deliveryDays : [])
                    .slice()
                    .sort((a, b) => a - b)
                    .map(
                      (d) =>
                        DAYS_OF_WEEK.find((dw) => dw.value === d)?.label || d,
                    )
                    .join(", ")}
                </div>
              </div>
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <span
                  style={{
                    fontSize: 11,
                    padding: "2px 6px",
                    borderRadius: 4,
                    background: sub.isActive ? "#dcfce7" : "#f3f4f6",
                    color: sub.isActive ? "#166534" : "#6b7280",
                    fontWeight: 600,
                  }}
                >
                  {sub.isActive ? "Active" : "Paused"}
                </span>
                <Btn
                  small
                  variant="secondary"
                  onClick={() => onViewHistory(sub)}
                >
                  History
                </Btn>
                <Btn small variant="secondary" onClick={() => onEdit(sub)}>
                  Edit
                </Btn>
                {onDelete && (
                  <Btn
                    small
                    variant="danger"
                    disabled={deletingId === sub.id}
                    title={sub.version ? `v${sub.version}` : undefined}
                    onClick={() => handleDelete(sub)}
                  >
                    {deletingId === sub.id ? "…" : "Delete"}
                  </Btn>
                )}
              </div>
            </div>
          ))
        )}
      </div>
    </Modal>
  );
}
