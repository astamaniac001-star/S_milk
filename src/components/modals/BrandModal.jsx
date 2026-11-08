import { Field, Modal, Btn, IS } from "../ui.jsx";
import { useBusy } from "../../hooks/useBusy.js";
import { MILK_TYPES } from "../../lib/constants.js";

// fallow-ignore-next-line complexity
export function BrandModal({ data, form, onChange, onSave, onClose, milkTypes }) {
  const [busy, save] = useBusy(onSave);
  const types = milkTypes?.length ? milkTypes : MILK_TYPES;
  // Rate rows: one rate per milk type (brands price each type differently).
  // Edit flow passes the full brand entity (data.rates); the add flow starts
  // with a single Full Cream row. Written back via the curried-event
  // contract — setF(k)(e) reads e.target.value.
  const rows =
    form?.rates?.length
      ? form.rates
      : data?.rates?.length
        ? data.rates
        : [{ milkType: data?.defaultMilkType || "Full Cream", rate: data?.rate ?? "" }];

  const setRows = (next) => onChange("rates")({ target: { value: next } });
  const updateRow = (i, patch) =>
    setRows(rows.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  const addRow = () => setRows([...rows, { milkType: "", rate: "" }]);
  const removeRow = (i) =>
    setRows(rows.length > 1 ? rows.filter((_, idx) => idx !== i) : rows);
  // One rate per milk type: types already used by another row are not
  // selectable here (brand_rates is UNIQUE (brand_id, milk_type)).
  const usedByOtherRows = (i) =>
    new Set(
      rows
        .filter((_, idx) => idx !== i)
        .map((r) => String(r?.milkType ?? "").trim())
        .filter(Boolean),
    );

  return (
    <Modal title={data?.id ? "Edit Brand" : "Add Milk Brand"} onClose={onClose}>
      <Field label="Brand Name *">
        <input
          style={IS()}
          value={form?.name ?? data?.name ?? ""}
          onChange={onChange("name")}
          placeholder="Amul"
        />
      </Field>
      <Field label="Supplier Name">
        <input
          style={IS()}
          value={form?.supplier ?? data?.supplier ?? ""}
          onChange={onChange("supplier")}
          placeholder="Amul Dairy Ltd."
        />
      </Field>
      <Field label="Supplier Phone">
        <input
          style={IS()}
          value={form?.phone ?? data?.phone ?? ""}
          onChange={onChange("phone")}
          placeholder="9000000001"
        />
      </Field>
      <Field label="Rates per Milk Type *">
        <div style={{ display: "grid", gap: 8 }}>
          {rows.map((row, i) => {
            const taken = usedByOtherRows(i);
            return (
            <div key={i} style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <select
                style={{ ...IS(), flex: 1 }}
                aria-label={`Type ${i + 1}`}
                value={row.milkType ?? ""}
                onChange={(e) => updateRow(i, { milkType: e.target.value })}
              >
                <option value="">Type…</option>
                {types.map((t) => (
                  <option key={t} value={t} disabled={taken.has(t)}>
                    {t}
                  </option>
                ))}
              </select>
              <input
                type="number"
                step="0.5"
                min="0"
                style={{ ...IS(), width: 110 }}
                aria-label={`Rate ${i + 1}`}
                value={row.rate ?? ""}
                onChange={(e) => updateRow(i, { rate: e.target.value })}
                placeholder="₹/L"
              />
              <Btn
                variant="secondary"
                aria-label={`Remove rate ${i + 1}`}
                onClick={() => removeRow(i)}
                disabled={busy || rows.length === 1}
                style={{ padding: "6px 10px" }}
              >
                ✕
              </Btn>
            </div>
            );
          })}
          <Btn variant="secondary" onClick={addRow} disabled={busy}>
            + Add type rate
          </Btn>
        </div>
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
