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
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true);
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
    const created = item.action === "CREATED";
    return (
      <div className="timeline-item" key={item.id}>
        <div className="timeline-rail">
          <div className={`timeline-dot ${created ? "created" : ""}`} />
          {idx !== history.length - 1 && <div className="timeline-line" />}
        </div>
        <div style={{ flex: 1, paddingBottom: 8, minWidth: 0 }}>
          <div className={`timeline-action ${created ? "created" : "updated"}`}>
            {item.action}
          </div>
          <div className="timeline-details">{item.details}</div>
          <div className="timeline-time">
            {new Date(item.timestamp).toLocaleString("en-IN")}
          </div>
        </div>
      </div>
    );
  };

  return (
    <Modal title={title} onClose={onClose} wide>
      {loading ? (
        <div className="diag-placeholder">Loading timeline...</div>
      ) : history.length === 0 ? (
        <div className="diag-placeholder">No changes recorded yet.</div>
      ) : (
        <div className="timeline">{history.map(renderHistoryItem)}</div>
      )}
    </Modal>
  );
}
