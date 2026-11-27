// Per-brand quick-save row for the Imports page: the brand's supply metadata,
// an Edit shortcut, and an inline draft-import form (date / litres / rate with
// a live total). Kept as its own unit so the row's form state does not live in
// the page component.

import { useState } from "react";
import { fmt, getToday } from "../../lib/utils.js";
import { Card, Btn, Badge } from "../../components/ui.jsx";
import { Pencil } from "lucide-react";

export function BrandImportRow({ brand, today, onSaveImport, onOpenModal }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({
    date: today || getToday(),
    qty: "",
    rate: brand.rate ? String(brand.rate) : "",
  });

  const qty = parseFloat(form.qty) || 0;
  const rate = parseFloat(form.rate) || 0;
  const total = Math.round(qty * rate * 100) / 100;

  const handleChange = (key) => (e) =>
    setForm((f) => ({ ...f, [key]: e.target.value }));

  const handleSave = async () => {
    if (busy) return;
    if (!form.date || !form.qty || !form.rate) return;
    setBusy(true);
    try {
      // saveImport resolves `false` on validation/API failure (the error toast
      // is shown upstream) — keep the form open with the entries intact so
      // the operator can correct instead of retyping.
      const ok = await onSaveImport({
        ...form,
        brand: brand.name,
        type: brand.defaultMilkType || "Full Cream",
        qty: parseFloat(form.qty),
        rate: parseFloat(form.rate),
      });
      if (ok === false) return;
      setOpen(false);
      setForm((f) => ({
        ...f,
        qty: "",
        rate: brand.rate ? String(brand.rate) : "",
      }));
    } finally {
      setBusy(false);
    }
  };

  const canSave = !!form.date && qty > 0 && rate > 0;

  return (
    <Card>
      <div className="import-row">
        <div className="row-main">
          <div className="row-title">
            {brand.name}
            <span className="pill">{brand.defaultMilkType || "—"}</span>
          </div>
          <div className="row-sub">
            {brand.supplier || "—"}
            {brand.phone ? " · " + brand.phone : ""}
            {brand.rate ? " · ₹" + brand.rate + "/L" : ""}
          </div>
        </div>
        <Badge label={brand.status} />
        <Btn
          small
          variant="secondary"
          onClick={() => onOpenModal?.("editBrand", brand)}
        >
          <Pencil size={13} aria-hidden="true" /> Edit
        </Btn>
        <Btn
          small
          variant="secondary"
          aria-expanded={open}
          onClick={() => setOpen((o) => !o)}
        >
          {open ? "Close" : "Add"}
        </Btn>
      </div>

      {open && (
        <div className="brand-form">
          <div className="brand-form-grid">
            <label className="field" style={{ gridColumn: "1 / -1" }}>
              <span className="field-label">Date</span>
              <input
                type="date"
                className="input"
                value={form.date}
                onChange={handleChange("date")}
              />
            </label>
            <label className="field">
              <span className="field-label">Litres</span>
              <input
                type="number"
                className="input"
                value={form.qty}
                placeholder="0"
                onChange={handleChange("qty")}
              />
            </label>
            <label className="field">
              <span className="field-label">Rate (₹/L)</span>
              <input
                type="number"
                step="0.5"
                className="input"
                value={form.rate}
                placeholder="0"
                onChange={handleChange("rate")}
              />
            </label>
          </div>
          <div className="brand-total tnum">
            Total: <strong>{fmt(total)}</strong>
          </div>
          <div className="toolbar-actions">
            <Btn onClick={handleSave} disabled={!canSave || busy}>
              {busy ? "Saving..." : "Save Draft"}
            </Btn>
            <Btn
              variant="secondary"
              onClick={() => setOpen(false)}
              disabled={busy}
            >
              Cancel
            </Btn>
          </div>
        </div>
      )}
    </Card>
  );
}
