import { Field, Modal, Btn, IS } from "../ui.jsx";
import { useBusy } from "../../hooks/useBusy.js";

function getCustomerModalTitle(isEdit) {
  return isEdit ? "Edit Customer" : "Add Customer";
}
function getCustomerModalButtonText(isEdit) {
  return isEdit ? "Update" : "Save";
}
// fallow-ignore-next-line complexity
export function CustomerModal({
  data,
  form,
  isEdit,
  onChange,
  onSave,
  onClose,
}) {
  const [busy, save] = useBusy(onSave);
  return (
    <Modal title={getCustomerModalTitle(isEdit)} onClose={onClose}>
      <Field label="Full Name *">
        <input
          style={IS()}
          value={form?.name ?? data?.name ?? ""}
          onChange={onChange("name")}
          placeholder="Ramesh Sharma"
        />
      </Field>
      <Field label="Delivery Address *">
        <input
          style={IS()}
          value={form?.address ?? data?.address ?? ""}
          onChange={onChange("address")}
          placeholder="14, Shivaji Nagar"
        />
      </Field>
      <Field label="Phone (10 digits)">
        <input
          style={IS()}
          value={form?.phone ?? data?.phone ?? ""}
          onChange={onChange("phone")}
          placeholder="9876543210"
        />
      </Field>
      <div style={{ fontSize: 12, color: "#6b7280", marginTop: 2 }}>
        Milk type, quantity, and delivery days are managed as subscriptions
        (Subscriptions tab).
      </div>
      <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
        <Btn onClick={save} disabled={busy}>
          {busy ? "Saving..." : getCustomerModalButtonText(isEdit)}
        </Btn>
        <Btn variant="secondary" onClick={onClose} disabled={busy}>
          Cancel
        </Btn>
      </div>
    </Modal>
  );
}
