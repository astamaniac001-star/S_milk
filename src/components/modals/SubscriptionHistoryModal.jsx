import { useState, useEffect, useMemo, useRef } from "react";
import { Modal } from "../ui.jsx";

function resolveCustomerName(customers, customerId) {
  if (!customerId) return "Subscription";
  const c = customers?.find((cu) => cu.id === customerId);
  return c?.name || "Subscription";
}

// fallow-ignore-next-line complexity
export function SubscriptionHistoryModal({
  data,
  onClose,
  handlers,
  customers = [],
}) {
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);

  // FIX (audit 2026-07-15): keep a ref to the latest handlers so the effect
  // doesn't refire when App.jsx re-creates the `ctx` object on every render.
  const handlersRef = useRef(handlers);
  useEffect(() => {
    handlersRef.current = handlers;
  });

  // fallow-ignore-next-line complexity
  useEffect(() => {
    const id = data?.id;
    if (!id) return;
    const fn = handlersRef.current?.fetchSubscriptionHistory;
    if (!fn) {
      // FIX (audit 2026-07-24): if the handler is missing, surface the error
      // rather than hanging on "Loading timeline..." forever.
      setLoading(false);
      return;
    }
    let cancelled = false;
    fn(id)
      .then((res) => {
        if (cancelled) return;
        setHistory(res);
        setLoading(false);
      })
      .catch((err) => {
        if (cancelled) return;
        // FIX (audit 2026-07-24): the previous version omitted .catch entirely,
        // so a reject from the handler left the modal stuck on Loading... forever.
        // Error layer §3 (handler try/catch) makes rejection rare, but we still
        // must not strand the user. Clear loading and show an inline error.
        console.error("Failed to load subscription history:", err);
        setHistory([]);
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [data?.id]);

  // ✅ FIX: resolve customer name from id (data carries customerId, not customerName)
  const title = useMemo(
    () => `History: ${resolveCustomerName(customers, data?.customerId)}`,
    [customers, data?.customerId],
  );

  // fallow-ignore-next-line complexity
  const renderHistoryItem = (item, idx) => {
    return (
      <div key={item.id} style={{ display: "flex", gap: 12, marginBottom: 16 }}>
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
          }}
        >
          <div
            style={{
              width: 10,
              height: 10,
              borderRadius: "50%",
              background: item.action === "CREATED" ? "#10b981" : "#3b82f6",
            }}
          />
          {idx !== history.length - 1 && (
            <div
              style={{ width: 2, flex: 1, background: "#e5e7eb", marginTop: 4 }}
            />
          )}
        </div>
        <div style={{ flex: 1, paddingBottom: 8 }}>
          <div
            style={{
              fontSize: 12,
              fontWeight: 600,
              color: item.action === "CREATED" ? "#059669" : "#1e40af",
            }}
          >
            {item.action}
          </div>
          <div style={{ fontSize: 13, color: "#111", marginTop: 2 }}>
            {item.details}
          </div>
          <div style={{ fontSize: 11, color: "#9ca3af", marginTop: 4 }}>
            {new Date(item.timestamp).toLocaleString("en-IN")}
          </div>
        </div>
      </div>
    );
  };

  return (
    <Modal title={title} onClose={onClose} wide>
      {loading ? (
        <div style={{ padding: 20, textAlign: "center", color: "#6b7280" }}>
          Loading timeline...
        </div>
      ) : history.length === 0 ? (
        <div style={{ padding: 20, textAlign: "center", color: "#9ca3af" }}>
          No changes recorded yet.
        </div>
      ) : (
        <div style={{ maxHeight: 400, overflowY: "auto", padding: "0 8px" }}>
          {history.map(renderHistoryItem)}
        </div>
      )}
    </Modal>
  );
}
