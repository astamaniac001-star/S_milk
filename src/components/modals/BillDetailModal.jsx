import { Modal, Btn } from "../ui.jsx";
import { fmt } from "../../lib/utils.js";

// fallow-ignore-next-line complexity
export function BillDetailModal({ data, onClose, customers = [] }) {
  const customerName =
    customers.find((c) => c.id === data.custId)?.name || "Unknown Customer";
  return (
    <Modal
      title={"Bill — " + customerName}
      onClose={onClose}
      footer={
        <Btn full variant="secondary" onClick={onClose}>
          Close
        </Btn>
      }
    >
      <div className="detail-grid">
        {[
          ["Bill ID", data.id],
          ["Customer", customerName],
          ["Month", data.month],
          ["Amount", fmt(data.amount)],
          ["Paid", fmt(data.paid)],
          ["Pending", fmt(data.amount - data.paid)],
          ["Status", data.status],
          ["Locked", data.locked ? "Yes" : "No"],
        ].map(([k, v]) => (
          <div className="detail-row" key={k}>
            <span className="detail-key">{k}</span>
            <span className="detail-val">{v}</span>
          </div>
        ))}
      </div>
    </Modal>
  );
}
