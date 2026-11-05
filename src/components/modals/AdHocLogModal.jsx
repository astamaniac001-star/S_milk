import { Field, Modal, Btn, IS, ActiveBrandOptions } from "../ui.jsx";
import { useBusy } from "../../hooks/useBusy.js";
import { MILK_TYPES } from "../../lib/constants.js";
import { CustomerDateFields } from "./shared";

// fallow-ignore-next-line complexity
export function AdHocLogModal({
  data,
  form,
  onChange,
  onSave,
  onClose,
  today,
  customers,
  brands = [],
}) {
  const [busy, save] = useBusy(onSave);
  return (
    <Modal title="Add Extra Delivery" onClose={onClose}>
      <CustomerDateFields
        form={form}
        data={data}
        today={today}
        customers={customers}
        onChange={onChange}
      />
      <Field label="Brand">
        <select
          style={IS()}
          value={form?.brandId ?? data?.brandId ?? ""}
          onChange={onChange("brandId")}
        >
          <option value="">Select Brand</option>
          {/* value = brand id — ad-hoc logs persist the brand FK */}
          <ActiveBrandOptions brands={brands} valueKey="id" />
        </select>
      </Field>
      <Field label="Product">
        <select
          style={IS()}
          value={form?.product ?? data?.product ?? "Full Cream"}
          onChange={onChange("product")}
        >
          {MILK_TYPES.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Quantity (L) *">
        <input
          type="number"
          step="0.5"
          style={IS()}
          value={form?.qty ?? 1}
          onChange={onChange("qty")}
        />
      </Field>
      <Field label="Reason (Optional)">
        <input
          style={IS()}
          value={form?.reason ?? ""}
          onChange={onChange("reason")}
          placeholder="Guests, Festival..."
        />
      </Field>
      <div style={{ display: "flex", gap: 8 }}>
        <Btn onClick={save} disabled={busy}>
          {busy ? "Adding..." : "Add Delivery"}
        </Btn>
        <Btn variant="secondary" onClick={onClose} disabled={busy}>
          Cancel
        </Btn>
      </div>
    </Modal>
  );
}
