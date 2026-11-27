import { Field, Modal, Btn, ActiveBrandOptions } from "../ui.jsx";
import { useBusy } from "../../hooks/useBusy.js";
import { fmt } from "../../lib/utils.js";

// fallow-ignore-next-line complexity
function calculateImportTotal(form, data) {
  const qty = parseFloat(form?.qty ?? data?.qty ?? 0) || 0;
  const rate = parseFloat(form?.rate ?? data?.rate ?? 0) || 0;
  return Math.round(qty * rate * 100) / 100;
}

// fallow-ignore-next-line complexity
function ImportDateField({ data, form, today, onChange }) {
  return (
    <Field label="Date *">
      <input
        type="date"
        className="input"
        value={form?.date ?? data?.date ?? today ?? ""}
        onChange={onChange("date")}
      />
    </Field>
  );
}

// fallow-ignore-next-line complexity
function ImportBrandField({ data, form, brands, onChange }) {
  return (
    <Field label="Brand *">
      <select
        className="input"
        value={form?.brand ?? data?.brand ?? ""}
        onChange={onChange("brand")}
      >
        <option value="">Select Brand</option>
        <ActiveBrandOptions brands={brands} />
      </select>
    </Field>
  );
}

// fallow-ignore-next-line complexity
function ImportTypeField({ data, form, milkTypes, onChange }) {
  return (
    <Field label="Milk Type *">
      <select
        className="input"
        value={form?.type ?? data?.type ?? ""}
        onChange={onChange("type")}
      >
        <option value="">Select Type</option>
        {milkTypes.map((t) => (
          <option key={t}>{t}</option>
        ))}
      </select>
    </Field>
  );
}

// fallow-ignore-next-line complexity
function ImportQtyRateField({ data, form, onChange }) {
  return (
    <div className="form-grid-2">
      <Field label="Qty (L) *">
        <input
          type="number"
          className="input"
          value={form?.qty ?? data?.qty ?? ""}
          onChange={onChange("qty")}
          placeholder="100"
        />
      </Field>
      <Field label="Rate (₹/L) *">
        <input
          type="number"
          step="0.5"
          className="input"
          value={form?.rate ?? data?.rate ?? ""}
          onChange={onChange("rate")}
          placeholder="36"
        />
      </Field>
    </div>
  );
}

// fallow-ignore-next-line complexity
function ImportMetaFields({ data, form, onChange }) {
  return (
    <>
      <Field label="Supplier">
        <input
          className="input"
          value={form?.supplier ?? data?.supplier ?? ""}
          onChange={onChange("supplier")}
        />
      </Field>
    </>
  );
}

// fallow-ignore-next-line complexity
function ImportTotalDisplay({ total }) {
  return (
    <div className="modal-total">
      Total: <strong>{fmt(total)}</strong>
    </div>
  );
}

export function ImportModal({
  data,
  form,
  onChange,
  onSave,
  onClose,
  today,
  brands,
  milkTypes,
}) {
  const [busy, save] = useBusy(onSave);
  const total = calculateImportTotal(form, data);
  return (
    <Modal
      title={data.id ? "Edit Import" : "Add Milk Import"}
      onClose={onClose}
      footer={
        <>
          <Btn onClick={save} disabled={busy}>
            {busy ? "Saving..." : data.id ? "Update" : "Save Draft"}
          </Btn>
          <Btn variant="secondary" onClick={onClose} disabled={busy}>
            Cancel
          </Btn>
        </>
      }
    >
      {/* Field order matters for the e2e suite: date input, then brand select
          (first <select>), then type select (second), then qty (first number
          input) and rate (second) — see per-card-buttons.test.js. */}
      <ImportDateField
        data={data}
        form={form}
        today={today}
        onChange={onChange}
      />
      <ImportBrandField
        data={data}
        form={form}
        brands={brands}
        onChange={onChange}
      />
      <ImportTypeField
        data={data}
        form={form}
        milkTypes={milkTypes}
        onChange={onChange}
      />
      <ImportQtyRateField data={data} form={form} onChange={onChange} />
      <ImportMetaFields data={data} form={form} onChange={onChange} />
      <ImportTotalDisplay total={total} />
    </Modal>
  );
}
