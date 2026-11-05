import { Field, Modal, Btn, IS, ActiveCustomerOptions, ActiveBrandOptions } from "../ui.jsx";
import { useBusy } from "../../hooks/useBusy.js";
import { DAYS_OF_WEEK } from "./shared";

// fallow-ignore-next-line complexity
export function SubscriptionModal({
  data,
  form,
  onChange,
  onSave,
  onClose,
  customers,
  brands = [],
  milkTypes = [],
}) {
  const [busy, save] = useBusy(onSave);
  const currentDays = form?.deliveryDays || data?.deliveryDays || [];

  const toggleDay = (day) => {
    const next = currentDays.includes(day)
      ? currentDays.filter((d) => d !== day)
      : [...currentDays, day];
    // FIX (audit 2026-07-24, rule §16): use the curried-event contract that
    // `setF` expects — `setF(k)(e)` reads `e.target.value`. Manufacturing a
    // synthetic event keeps this form on a single onChange contract instead
    // of mixing curried-event (for text/select) with direct-value (here).
    onChange("deliveryDays")({ target: { value: next } });
  };

  // ✅ Extracted to a named function so fallow can read the ignore comment
  // fallow-ignore-next-line complexity
  const renderDayButton = (d) => {
    const isSelected = currentDays.includes(d.value);
    return (
            <button
              key={d.value}
              type="button"
              onClick={() => toggleDay(d.value)}
              aria-pressed={isSelected}
              style={{
          padding: "6px 10px",
          borderRadius: 6,
          border: isSelected ? "1px solid #1e40af" : "1px solid #d1d5db",
          background: isSelected ? "#dbeafe" : "#fff",
          color: isSelected ? "#1e40af" : "#6b7280",
          fontWeight: isSelected ? 600 : 400,
          cursor: "pointer",
          fontSize: 12,
        }}
      >
        {d.label}
      </button>
    );
  };

  return (
    <Modal
      title={data?.id ? "Edit Subscription" : "Add Subscription"}
      onClose={onClose}
    >
      <Field label="Customer *">
        <select
          style={IS()}
          value={form?.customerId ?? data?.customerId ?? ""}
          onChange={onChange("customerId")}
          // A subscription's customer cannot be reassigned — the update path
          // only writes brand_id/milk_type/qty/delivery_days/is_active. Keep
          // the field read-only in edit mode so the operator is not misled.
          disabled={!!data?.id}
        >
          <option value="">Select Customer</option>
          <ActiveCustomerOptions customers={customers} />
        </select>
      </Field>
      <Field label="Brand *">
        <select
          style={IS()}
          value={form?.brandId ?? data?.brandId ?? ""}
          onChange={onChange("brandId")}
        >
          <option value="">Select Brand</option>
          {/* value = brand id — subscriptions persist the brand FK */}
          <ActiveBrandOptions brands={brands} valueKey="id" />
        </select>
      </Field>
      <Field label="Milk Type *">
        <select
          style={IS()}
          value={form?.milkType ?? data?.milkType ?? ""}
          onChange={onChange("milkType")}
        >
          <option value="">Select Type</option>
          {milkTypes.map((t) => (
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
          value={form?.qty ?? data?.qty ?? 1}
          onChange={onChange("qty")}
        />
      </Field>
      <Field label="Delivery Days *">
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {DAYS_OF_WEEK.map(renderDayButton)}
        </div>
      </Field>
      <Field label="Status">
        <label
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            cursor: "pointer",
          }}
        >
          <input
            type="checkbox"
            checked={
              form?.isActive !== undefined
                ? form.isActive
                : data?.isActive !== undefined
                  ? data.isActive
                  : true
            }
            // FIX (audit 2026-07-24): wrap the event so onChange("isActive")
            // reads e.target.value (curried-event contract). The value is the
            // boolean — setF stores it, mirroring how PaymentModal auto-fills.
            onChange={(e) =>
              onChange("isActive")({ target: { value: e.target.checked } })
            }
          />
          <span style={{ fontSize: 13, color: "#111" }}>Active</span>
        </label>
      </Field>
      <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
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
