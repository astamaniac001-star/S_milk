import { useEffect } from "react";
import { Field, Modal, Btn, IS } from "../ui.jsx";
import { useBusy } from "../../hooks/useBusy.js";
import { fmt, getToday } from "../../lib/utils.js";
import { BLUE_L, BLUE } from "../../lib/constants.js";

// fallow-ignore-next-line complexity
export function PaymentModal({
  data,
  form,
  onChange,
  onSave,
  onClose,
  today,
  payModes,
  customers = [],
}) {
  const customerName =
    customers.find((c) => c.id === data.custId)?.name || "Unknown Customer";
  const [busy, save] = useBusy(onSave);
  useEffect(() => {
    if (data && form?.payAmt === undefined) {
      const pending = (data.amount || 0) - (data.paid || 0);
      // We use the object/event shape that standard onChange handlers expect
      onChange("payAmt")({ target: { value: pending } });
      onChange("payMode")({ target: { value: "Cash" } });
      onChange("payDate")({ target: { value: today || getToday() } });
    }
  }, [data, form, onChange, today]);

  return (
    <Modal title={"Record Payment — " + customerName} onClose={onClose}>
      <div
        style={{
          background: BLUE_L,
          borderRadius: 8,
          padding: "10px 12px",
          fontSize: 13,
          color: BLUE,
          marginBottom: 14,
        }}
      >
        Bill: {fmt(data.amount)} · Paid: {fmt(data.paid)} ·{" "}
        <strong>Pending: {fmt(data.amount - data.paid)}</strong>
      </div>
      <Field label="Amount (₹) *">
        <input
          type="number"
          style={IS()}
          value={form?.payAmt ?? data.amount - data.paid}
          onChange={onChange("payAmt")}
        />
      </Field>
      <Field label="Payment Mode">
        <select
          style={IS()}
          value={form?.payMode ?? "Cash"}
          onChange={onChange("payMode")}
        >
          {payModes.map((m) => (
            <option key={m}>{m}</option>
          ))}
        </select>
      </Field>
      <Field label="Date">
        <input
          type="date"
          style={IS()}
          value={form?.payDate ?? today ?? ""}
          onChange={onChange("payDate")}
        />
      </Field>
      <Field label="Notes (optional)">
        <input
          style={IS()}
          value={form?.payNote ?? ""}
          onChange={onChange("payNote")}
          placeholder="Ref no., remarks…"
        />
      </Field>
      <div style={{ display: "flex", gap: 8 }}>
        <Btn onClick={save} disabled={busy}>
          {busy
            ? "Recording..."
            : `Record ${form?.payAmt ? fmt(form.payAmt) : ""}`}
        </Btn>
        <Btn variant="secondary" onClick={onClose} disabled={busy}>
          Cancel
        </Btn>
      </div>
    </Modal>
  );
}
