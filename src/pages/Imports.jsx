// ── Imports.jsx ───────────────────────────────────────────────────────────────
import { useRef, useState, useMemo } from "react";
import { fmt, getToday, toNum, brandLabel } from "../lib/utils.js";
import { Card, Btn, IS, Section, StatGrid, Empty, Badge, Modal } from "../components/ui.jsx";

const STATUS_FILTERS = ["Draft", "Confirmed", "Reconciled"];

function buildQuantityBreakdown(imports) {
  const map = new Map();
  (imports || []).forEach((i) => {
    const key = `${i.brand}||${i.type}`;
    if (!map.has(key)) map.set(key, { brand: i.brand, type: i.type, qty: 0, cost: 0 });
    const row = map.get(key);
    row.qty += toNum(i.qty);
    row.cost += toNum(i.total);
  });
  const rows = Array.from(map.values());
  rows.sort((a, b) => a.brand === b.brand ? a.type.localeCompare(b.type) : a.brand.localeCompare(b.brand));
  return rows;
}

// Same logic as Delivery.jsx's buildTotalBreakdown but for the Imports modal:
// aggregates imports (qty) + today's delivered logs by brand/type.
function buildImportDeliveryBreakdown(imports, logs, brands, logDate, today) {
  const targetDate = logDate || today;
  const dayImports = (imports || []).filter(
    (i) => i.status === "Confirmed" && i.date === targetDate,
  );
  const deliveredLogs = (logs || []).filter((l) => l.delivered && l.date === targetDate);

  const map = new Map();
  const ensure = (brand, type) => {
    const key = `${brand}||${type}`;
    if (!map.has(key)) map.set(key, { brand, type, imported: 0, delivered: 0 });
    return map.get(key);
  };

  dayImports.forEach((i) => {
    const r = ensure(i.brand, i.type || "Mixed");
    r.imported += toNum(i.qty);
  });

  deliveredLogs.forEach((l) => {
    const milkType = l.product || "Milk";
    // Brand-aware: log.brandId resolves directly; legacy rows fall back to
    // the milk-type heuristic.
    const brandName = brandLabel(l, brands);
    const r = ensure(brandName, milkType);
    r.delivered += toNum(l.qty);
  });

  const rows = Array.from(map.values());
  rows.sort((a, b) =>
    a.brand === b.brand ? a.type.localeCompare(b.type) : a.brand.localeCompare(b.brand),
  );
  return rows;
}

function QtyBreakdownModal({ rows, onClose }) {
  return (
    <Modal title="Qty & Cost by Brand / Type" onClose={onClose} wide>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
        <thead>
          <tr style={{ borderBottom: "2px solid var(--border-color)" }}>
            <th style={{ padding: "6px", textAlign: "left" }}>Brand</th>
            <th style={{ padding: "6px", textAlign: "left" }}>Type</th>
            <th style={{ padding: "6px", textAlign: "right" }}>Qty (L)</th>
            <th style={{ padding: "6px", textAlign: "right" }}>Cost</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} style={{ borderBottom: "1px solid var(--border-color)" }}>
              <td style={{ padding: "6px", fontWeight: 600 }}>{r.brand}</td>
              <td style={{ padding: "6px" }}>{r.type}</td>
              <td style={{ padding: "6px", textAlign: "right" }}>{r.qty}</td>
              <td style={{ padding: "6px", textAlign: "right" }}>{fmt(r.cost)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Modal>
  );
}

function DeliveryBreakdownModal({ rows, onClose }) {
  return (
    <Modal title="Today's Delivery Logs by Brand / Type" onClose={onClose} wide>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
        <thead>
          <tr style={{ borderBottom: "2px solid var(--border-color)" }}>
            <th style={{ padding: "6px", textAlign: "left" }}>Brand</th>
            <th style={{ padding: "6px", textAlign: "left" }}>Type</th>
            <th style={{ padding: "6px", textAlign: "right" }}>Imported (L)</th>
            <th style={{ padding: "6px", textAlign: "right" }}>Delivered (L)</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} style={{ borderBottom: "1px solid var(--border-color)" }}>
              <td style={{ padding: "6px", fontWeight: 600 }}>{r.brand}</td>
              <td style={{ padding: "6px" }}>{r.type}</td>
              <td style={{ padding: "6px", textAlign: "right" }}>{r.imported}</td>
              <td style={{ padding: "6px", textAlign: "right" }}>{r.delivered}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Modal>
  );
}

function BrandImportRow({ brand, today, onSaveImport, onOpenModal }) {
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
      await onSaveImport({
        ...form,
        brand: brand.name,
        type: brand.defaultMilkType || "Full Cream",
        qty: parseFloat(form.qty),
        rate: parseFloat(form.rate),
      });
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
    <Card style={{ padding: 12 }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: 8,
        }}
      >
        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{ fontSize: 16, fontWeight: 700, color: "var(--text-primary, #0f172a)" }}
          >
            {brand.name}{" "}
            <span style={{ fontSize: 13, fontWeight: 500, color: "var(--text-secondary, #475569)" }}>
              · {brand.defaultMilkType || "—"}
            </span>
          </div>
          <div style={{ fontSize: 12, color: "var(--text-secondary, #6b7280)" }}>
            {brand.supplier || "—"}
            {brand.phone ? " · " + brand.phone : ""}
            {brand.rate ? " · ₹" + brand.rate + "/L" : ""}
          </div>
        </div>
        <Badge label={brand.status} />
        <Btn small variant="secondary" onClick={() => onOpenModal?.("editBrand", brand)}>
          Edit
        </Btn>
        <Btn small variant="secondary" onClick={() => setOpen((o) => !o)}>
          {open ? "Close" : "Add"}
        </Btn>
      </div>
      {open && (
        <div
          style={{
            marginTop: 10,
            paddingTop: 10,
            borderTop: "1px dashed var(--border-color, #e2e8f0)",
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: 8,
          }}
        >
          <div style={{ gridColumn: "1 / -1" }}>
            <label style={{ fontSize: 12, color: "var(--text-secondary, #475569)", display: "block", marginBottom: 4 }}>
              Date
            </label>
            <input type="date" style={IS()} value={form.date} onChange={handleChange("date")} />
          </div>
          <div>
            <label style={{ fontSize: 12, color: "var(--text-secondary, #475569)", display: "block", marginBottom: 4 }}>
              Litres
            </label>
            <input type="number" style={IS()} value={form.qty} placeholder="0" onChange={handleChange("qty")} />
          </div>
          <div>
            <label style={{ fontSize: 12, color: "var(--text-secondary, #475569)", display: "block", marginBottom: 4 }}>
              Rate (₹/L)
            </label>
            <input type="number" step="0.5" style={IS()} value={form.rate} placeholder="0" onChange={handleChange("rate")} />
          </div>
          <div
            style={{
              gridColumn: "1 / -1",
              background: "#f0fdf4",
              border: "1px solid #bbf7d0",
              borderRadius: 8,
              padding: "8px 12px",
              fontSize: 13,
              color: "#166534",
            }}
          >
            Total: <strong>{fmt(total)}</strong>
          </div>
          <div style={{ gridColumn: "1 / -1", display: "flex", gap: 8 }}>
            <Btn onClick={handleSave} disabled={!canSave || busy}>
              {busy ? "Saving..." : "Save Draft"}
            </Btn>
            <Btn variant="secondary" onClick={() => setOpen(false)} disabled={busy}>
              Cancel
            </Btn>
          </div>
        </div>
      )}
    </Card>
  );
}

export default function Imports({
  filtered = [],
  allImports = [],
  brands = [],
  logs = [],
  logDate,
  impFilter,
  onImpFilterChange,
  onOpenModal,
  onConfirm,
  onDelete,
  onSaveImport,
  today,
}) {
  const safeFiltered = useMemo(
    () => (Array.isArray(filtered) ? filtered : []),
    [filtered],
  );
  const [modal, setModal] = useState(null); // "qtyBreakdown" | "deliveryBreakdown"

  const totalQty = safeFiltered
    .filter((i) => i.status === "Confirmed")
    .reduce((s, i) => s + Number(i.qty || 0), 0);

  const totalCost = safeFiltered
    .filter((i) => i.status === "Confirmed")
    .reduce((s, i) => s + Number(i.total || 0), 0);

  const deletingRef = useRef(false);

  const handleDelete = async (imp) => {
    if (!window.confirm(`Permanently delete import from ${imp.brand} on ${imp.date}?`)) return;
    if (deletingRef.current) return;
    deletingRef.current = true;
    try {
      await onDelete(imp.id, imp.version);
    } finally {
      deletingRef.current = false;
    }
  };

  const qtyBreakdown = useMemo(() => buildQuantityBreakdown(safeFiltered), [safeFiltered]);
  const deliveryBreakdown = useMemo(
    () => buildImportDeliveryBreakdown(allImports, logs, brands, logDate, today),
    [allImports, logs, brands, logDate, today],
  );

  return (
    <div>
       <Section
          title="Milk Imports"
          action={
            <div style={{ display: "flex", gap: 6 }}>
              <Btn small variant="secondary" onClick={() => onOpenModal("addBrand")}>
                + Brand
              </Btn>
              <Btn small variant="primary" onClick={() => onOpenModal("addImport")}>
                + Import
              </Btn>
            </div>
          }
       />
      <div style={{ display: "flex", gap: 6, marginBottom: 10, flexWrap: "wrap" }}>
        <input
          id="import-month"
          name="import-month"
          type="month"
          value={impFilter.month}
          onChange={(e) => onImpFilterChange({ ...impFilter, month: e.target.value })}
          style={{ ...IS(), flex: 1 }}
        />
        <select
          id="import-brand"
          name="import-brand"
          value={impFilter.brand}
          onChange={(e) => onImpFilterChange({ ...impFilter, brand: e.target.value })}
          style={{ ...IS(), flex: 1 }}
        >
          <option value="">All Brands</option>
          {(brands || []).map((b) => (
            <option key={b.id} value={b.name}>{b.name}</option>
          ))}
        </select>
        <select
          id="import-status"
          name="import-status"
          value={impFilter.status}
          onChange={(e) => onImpFilterChange({ ...impFilter, status: e.target.value })}
          style={{ ...IS(), flex: 1 }}
        >
          <option value="">All Status</option>
          {STATUS_FILTERS.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
      </div>

      {/* CLICKABLE: opens brand+type qty+price breakdown modal */}
      <div onClick={() => setModal("qtyBreakdown")} style={{ cursor: "pointer" }}>
        <StatGrid
          items={[
            {
              label: "Total Qty & Cost",
              value: `${totalQty} L · ${fmt(totalCost)}`,
              icon: "🥛",
              bg: "#eff6ff",
              tx: "#1e40af",
            },
            { label: "Imports", value: safeFiltered.length, icon: "📦" },
          ]}
        />
      </div>

      {safeFiltered.length === 0 ? (
        <Empty msg="No imports match filters" />
      ) : (
        safeFiltered.map((imp) => (
          <Card key={imp.id}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
              <div>
                <div style={{ fontWeight: 600, fontSize: 14, color: "#111" }}>
                  {imp.brand}
                </div>
                <div style={{ fontSize: 12, color: "#6b7280" }}>
                  {imp.date} · {imp.type}
                </div>
                <div style={{ fontSize: 13, color: "#374151", marginTop: 4 }}>
                  {imp.qty} L @ {fmt(imp.rate)}/L = <strong>{fmt(imp.total)}</strong>
                </div>
                <div style={{ fontSize: 11, color: "#9ca3af" }}>v{imp.version}</div>
              </div>
              <Badge label={imp.status} />
            </div>
            {imp.status === "Draft" && (
              <div style={{ display: "flex", gap: 6, marginTop: 10 }}>
                <Btn small variant="secondary" onClick={() => onOpenModal("addImport", imp)}>
                  Edit
                </Btn>
                <Btn small variant="success" onClick={() => onConfirm(imp.id)}>
                  Confirm
                </Btn>
                <Btn small variant="danger" onClick={() => handleDelete(imp)}>
                  Delete
                </Btn>
              </div>
            )}
          </Card>
        ))
      )}

      <div style={{ fontWeight: 600, fontSize: 13, color: "#374151", margin: "12px 0 8px" }}>
        Brands
      </div>
      {(brands || []).length === 0 ? (
        <Empty msg="No brands yet. Tap + Brand to add one." />
      ) : (
        (brands || []).map((b) => (
          <BrandImportRow
            key={b.id}
            brand={b}
            today={today}
            onSaveImport={onSaveImport}
            onOpenModal={onOpenModal}
          />
        ))
      )}

      {modal === "qtyBreakdown" && (
        <QtyBreakdownModal rows={qtyBreakdown} onClose={() => setModal(null)} />
      )}
      {modal === "deliveryBreakdown" && (
        <DeliveryBreakdownModal rows={deliveryBreakdown} onClose={() => setModal(null)} />
      )}
    </div>
  );
}