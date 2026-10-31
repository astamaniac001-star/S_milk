import { Field, Modal, Btn, IS } from "../ui.jsx";
import { useBusy } from "../../hooks/useBusy.js";
import { CustomerDateFields } from "./shared";

// fallow-ignore-next-line complexity
export function AdjustmentModal({
  data,
  form,
  onChange,
  onSave,
  onClose,
  today,
  customers,
}) {
  const [busy, save] = useBusy(onSave);
  return (
    <Modal title="Add Adjustment" onClose={onClose}>
      <CustomerDateFields
        form={form}
        data={data}
        today={today}
        customers={customers}
        onChange={onChange}
      />
      {/* Sign contract (AGENTS §14) matches apply_adjustment_rpc: the RPC
          computes bill.amount - adjustment.amount, so a POSITIVE amount is
          the deduction (reduces the bill) and a negative amount ADDS to it. */}
      <Field label="Amount (₹, positive = reduces bill) *">
        <input
          type="number"
          style={IS()}
          value={form?.amount ?? ""}
          onChange={onChange("amount")}
          placeholder="50 reduces · -50 adds"
        />
      </Field>
      <Field label="Reason *">
        <input
          style={IS()}
          value={form?.reason ?? ""}
          onChange={onChange("reason")}
          placeholder="Half delivery, Quality issue…"
        />
      </Field>
      <div style={{ display: "flex", gap: 8 }}>
        <Btn onClick={save} disabled={busy}>
          {busy ? "Saving..." : "Save"}
        </Btn>
        <Btn variant="secondary" onClick={onClose} disabled={busy}>
          Cancel
        </Btn>
      </div>
    </Modal>
  );
}
