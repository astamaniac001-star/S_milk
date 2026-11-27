import { Field, Modal, Btn } from "../ui.jsx";
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
    <Modal
      title={getCustomerModalTitle(isEdit)}
      onClose={onClose}
      footer={
        <>
          <Btn onClick={save} disabled={busy}>
            {busy ? "Saving..." : getCustomerModalButtonText(isEdit)}
          </Btn>
          <Btn variant="secondary" onClick={onClose} disabled={busy}>
            Cancel
          </Btn>
        </>
      }
    >
      <Field label="Full Name *">
        <input
          className="input"
          value={form?.name ?? data?.name ?? ""}
          onChange={onChange("name")}
          placeholder="Ramesh Sharma"
        />
      </Field>
      <Field label="Delivery Address *">
        <input
          className="input"
          value={form?.address ?? data?.address ?? ""}
          onChange={onChange("address")}
          placeholder="14, Shivaji Nagar"
        />
      </Field>
      <Field label="Phone (10 digits)">
        <input
          className="input"
          type="tel"
          inputMode="numeric"
          value={form?.phone ?? data?.phone ?? ""}
          onChange={onChange("phone")}
          placeholder="9876543210"
        />
      </Field>
      <div className="modal-note">
        Milk type, quantity, and delivery days are managed as subscriptions
        (Subscriptions tab).
      </div>
    </Modal>
  );
}
