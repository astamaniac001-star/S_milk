// ── Imports.jsx ───────────────────────────────────────────────────────────────
// Milk purchases from brands/suppliers ("imports") + the per-brand quick-save
// row + the brand × type stock breakdowns. View modes: month / single day /
// inclusive date range (2026-11-10); Day mode also shows the confirmed-stock
// card fed by getDailyInventory.

import { useRef, useState, useMemo } from "react";
import { fmt, getToday, toNum } from "../lib/utils.js";
import { buildMonthOptions, defaultImportRange } from "../lib/filters.js";
import {
  buildQuantityBreakdown,
  buildStockBreakdown,
} from "../lib/breakdowns.js";
import {
  Card,
  Btn,
  Section,
  Empty,
  Badge,
  Modal,
} from "../components/ui.jsx";
import {
  CalendarRange,
  Droplets,
  Package,
  Pencil,
  Tag,
} from "lucide-react";

const STATUS_FILTERS = ["Draft", "Confirmed", "Reconciled"];

// Shared table for the two breakdown modals (audit 2026-11-09 F16 — the
// thead/tbody markup was cloned verbatim between QtyBreakdownModal and
// DeliveryBreakdownModal). First two columns left-aligned, the rest right.
function BreakdownTable({ headers, rows, renderCells }) {
  return (
    <div style={{ overflowX: "auto" }}>
      <table className="data-table">
        <thead>
          <tr>
            {headers.map((h, i) => (
              <th key={h} className={i < 2 ? "" : "num"}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i}>{renderCells(r)}</tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function QtyBreakdownModal({ rows, onClose }) {
  return (
    <Modal title="Qty & Cost by Brand / Type" onClose={onClose} wide>
      <BreakdownTable
        headers={["Brand", "Type", "Qty (L)", "Cost"]}
        rows={rows}
        renderCells={(r) => (
          <>
            <td style={{ fontWeight: 600 }}>{r.brand}</td>
            <td>{r.type}</td>
            <td className="num">{r.qty}</td>
            <td className="num">{fmt(r.cost)}</td>
          </>
        )}
      />
    </Modal>
  );
}

function DeliveryBreakdownModal({ rows, dateLabel, onClose }) {
  return (
    <Modal
      title={`Imported vs Delivered · ${dateLabel}`}
      onClose={onClose}
      wide
    >
      <BreakdownTable
        headers={["Brand", "Type", "Imported (L)", "Delivered (L)"]}
        rows={rows}
        renderCells={(r) => (
          <>
            <td style={{ fontWeight: 600 }}>{r.brand}</td>
            <td>{r.type}</td>
            <td className="num">{r.imported}</td>
            <td className="num">{r.delivered}</td>
          </>
        )}
      />
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

export default function Imports({
  filtered = [],
  allImports = [],
  brands = [],
  logs = [],
  logDate,
  impFilter = {},
  onImpFilterChange,
  onOpenModal,
  onConfirm,
  onDelete,
  onSaveImport,
  today,
  // Daily stock card payload for the "By day" view (from useEntityStore's
  // getDailyInventory fetch); null while loading / outside Day mode.
  inventory = null,
}) {
  const safeFiltered = useMemo(
    () => (Array.isArray(filtered) ? filtered : []),
    [filtered],
  );
  const [modal, setModal] = useState(null); // "qtyBreakdown" | "deliveryBreakdown"

  const viewMode = impFilter.mode || "month";

  // Mode switch with sensible defaults so a freshly-picked mode is
  // immediately useful: Day → today; Range → first of the previous month
  // through today (the operator's "previous + current month" window).
  // getToday() is IST-derived (rule §8).
  const handleViewMode = (mode) => {
    const next = { ...impFilter, mode };
    if (mode === "day" && !next.day) next.day = today || getToday();
    if (mode === "range" && !next.from && !next.to) {
      Object.assign(next, defaultImportRange(today || getToday()));
    }
    onImpFilterChange(next);
  };

  const confirmed = safeFiltered.filter((i) => i.status === "Confirmed");
  const totalQty = Math.round(
    confirmed.reduce((s, i) => s + Number(i.qty || 0), 0) * 100,
  ) / 100;
  const totalCost = confirmed.reduce((s, i) => s + Number(i.total || 0), 0);

  // Only trust an inventory payload that belongs to the currently-selected
  // day — the payload carries its own `date` (from getDailyInventory), so a
  // stale payload from a previously-viewed day renders as "loading" instead
  // of showing wrong numbers.
  const dayInventory =
    impFilter.day && inventory && inventory.date === impFilter.day
      ? inventory
      : null;

  const deletingRef = useRef(false);

  const handleDelete = async (imp) => {
    if (
      !window.confirm(
        `Permanently delete import from ${imp.brand} on ${imp.date}?`,
      )
    )
      return;
    if (deletingRef.current) return;
    deletingRef.current = true;
    try {
      await onDelete(imp.id, imp.version);
    } finally {
      deletingRef.current = false;
    }
  };

  const qtyBreakdown = useMemo(
    () => buildQuantityBreakdown(safeFiltered),
    [safeFiltered],
  );
  const deliveryBreakdown = useMemo(
    () =>
      buildStockBreakdown({
        imports: allImports,
        logs,
        brands,
        date: logDate || today,
      }).rows,
    [allImports, logs, brands, logDate, today],
  );

  return (
    <div>
      <Section
        title="Milk Imports"
        action={
          <div className="toolbar-actions">
            <Btn
              small
              variant="secondary"
              onClick={() => onOpenModal("addBrand")}
            >
              + Brand
            </Btn>
            <Btn small variant="primary" onClick={() => onOpenModal("addImport")}>
              + Import
            </Btn>
          </div>
        }
      />

      <Card>
        <div className="filter-bar">
          {/* View mode (2026-11-10): month (as before), a single day, or an
              inclusive date range. Only the active mode's picker renders, so
              the default month view is unchanged for existing flows/e2e. */}
          <select
            id="import-view"
            name="import-view"
            aria-label="Show imports by"
            className="input filter-control"
            value={viewMode}
            onChange={(e) => handleViewMode(e.target.value)}
          >
            <option value="month">By month</option>
            <option value="day">By day</option>
            <option value="range">By date range</option>
          </select>
          {viewMode === "month" && (
            <select
              id="import-month"
              name="import-month"
              aria-label="Filter imports by month"
              className="input filter-control"
              value={impFilter.month || ""}
              onChange={(e) =>
                onImpFilterChange({ ...impFilter, month: e.target.value })
              }
            >
              <option value="">All months</option>
              {buildMonthOptions(allImports).map((m) => (
                <option key={m.value} value={m.value}>
                  {m.label}
                </option>
              ))}
            </select>
          )}
          {viewMode === "day" && (
            <input
              type="date"
              id="import-day"
              name="import-day"
              aria-label="Show imports for date"
              className="input filter-control"
              value={impFilter.day || ""}
              onChange={(e) =>
                onImpFilterChange({ ...impFilter, day: e.target.value })
              }
            />
          )}
          {viewMode === "range" && (
            <>
              <input
                type="date"
                id="import-from"
                name="import-from"
                aria-label="Show imports from date"
                className="input filter-control"
                value={impFilter.from || ""}
                onChange={(e) =>
                  onImpFilterChange({ ...impFilter, from: e.target.value })
                }
              />
              <input
                type="date"
                id="import-to"
                name="import-to"
                aria-label="Show imports to date"
                className="input filter-control"
                value={impFilter.to || ""}
                onChange={(e) =>
                  onImpFilterChange({ ...impFilter, to: e.target.value })
                }
              />
            </>
          )}
          <select
            id="import-brand"
            name="import-brand"
            aria-label="Filter imports by brand"
            className="input filter-control"
            value={impFilter.brand || ""}
            onChange={(e) =>
              onImpFilterChange({ ...impFilter, brand: e.target.value })
            }
          >
            <option value="">All Brands</option>
            {(brands || []).map((b) => (
              <option key={b.id} value={b.name}>
                {b.name}
              </option>
            ))}
          </select>
          <select
            id="import-status"
            name="import-status"
            aria-label="Filter imports by status"
            className="input filter-control"
            value={impFilter.status || ""}
            onChange={(e) =>
              onImpFilterChange({ ...impFilter, status: e.target.value })
            }
          >
            <option value="">All Status</option>
            {STATUS_FILTERS.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>
      </Card>

      {/* Day view stock card — daily inventory from getDailyInventory
          (Confirmed imports only). Fetched by useEntityStore whenever the
          operator is in Day mode with a date picked; the fetch is wired at
          the composition root (useAppState → useEntityStore importDay). */}
      {viewMode === "day" && (
        <div className="stock-card">
          <div className="stock-head">
            <span className="stock-title">
              <CalendarRange size={14} aria-hidden="true" /> Stock for{" "}
              {impFilter.day || "— pick a date"}
            </span>
            <span className="pill">Confirmed</span>
          </div>
          {dayInventory ? (
            <>
              <div className="stock-stats">
                <span>
                  Imported:{" "}
                  <strong className="tnum">
                    {toNum(inventory.totalImported)} L
                  </strong>
                </span>
                <span>
                  Delivered:{" "}
                  <strong className="tnum">
                    {toNum(inventory.totalDelivered)} L
                  </strong>
                </span>
                <span>
                  Remaining:{" "}
                  <strong className="tnum">{toNum(inventory.remaining)} L</strong>
                </span>
                {toNum(inventory.shortage) > 0 && (
                  <span className="stock-shortage">
                    Shortage: {toNum(inventory.shortage)} L
                  </span>
                )}
              </div>
              <div className="stock-note">Imported counts Confirmed imports only.</div>
            </>
          ) : (
            <div className="stock-note">
              {impFilter.day
                ? "Loading stock…"
                : "Pick a date to see that day's stock."}
            </div>
          )}
        </div>
      )}

      {/* Qty & cost tile is a real button (keyboard accessible) and opens the
          brand+type breakdown modal. */}
      <div className="stat-grid">
        <button
          type="button"
          className="stat-tile"
          onClick={() => setModal("qtyBreakdown")}
          aria-label="Open quantity and cost breakdown"
          style={{ "--accent": "var(--brand-500)" }}
        >
          <div className="stat-label">
            <Droplets size={13} aria-hidden="true" /> Total Qty & Cost
          </div>
          <div className="stat-value stat-value-compact tnum">
            {totalQty} L · {fmt(totalCost)}
          </div>
        </button>
        <div className="stat-tile" style={{ "--accent": "var(--info-text)" }}>
          <div className="stat-label">
            <Package size={13} aria-hidden="true" /> Imports
          </div>
          <div className="stat-value">{safeFiltered.length}</div>
        </div>
      </div>

      {/* Imported stock vs delivered milk for the selected delivery date */}
      <div
        style={{
          display: "flex",
          justifyContent: "flex-end",
          margin: "10px 0 4px",
        }}
      >
        <Btn
          small
          variant="ghost"
          onClick={() => setModal("deliveryBreakdown")}
        >
          Imported vs Delivered
        </Btn>
      </div>

      {safeFiltered.length === 0 ? (
        <Empty msg="No imports match filters" icon={Package} />
      ) : (
        <div className="list">
          {safeFiltered.map((imp) => (
            <Card key={imp.id}>
              <div className="import-row">
                <div className="row-main">
                  <div className="row-title">
                    {imp.brand}
                    <span className="pill">{imp.type}</span>
                  </div>
                  <div className="row-sub tnum">{imp.date}</div>
                  <div className="row-sub tnum">
                    {imp.qty} L @ {fmt(imp.rate)}/L ={" "}
                    <strong>{fmt(imp.total)}</strong>
                  </div>
                  <div className="row-sub">
                    <span className="pill">v{imp.version}</span>
                  </div>
                </div>
                <Badge label={imp.status} />
              </div>
              {imp.status === "Draft" && (
                <div className="row-actions" style={{ marginTop: 12 }}>
                  <Btn
                    small
                    variant="secondary"
                    onClick={() => onOpenModal("addImport", imp)}
                  >
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
          ))}
        </div>
      )}

      <div className="section-head" style={{ marginTop: 18 }}>
        <h3 className="card-head-title">
          <Tag size={14} aria-hidden="true" /> Brands
        </h3>
      </div>
      {(brands || []).length === 0 ? (
        <Empty msg="No brands yet. Tap + Brand to add one." icon={Tag} />
      ) : (
        <div className="list">
          {(brands || []).map((b) => (
            <BrandImportRow
              key={b.id}
              brand={b}
              today={today}
              onSaveImport={onSaveImport}
              onOpenModal={onOpenModal}
            />
          ))}
        </div>
      )}

      {modal === "qtyBreakdown" && (
        <QtyBreakdownModal rows={qtyBreakdown} onClose={() => setModal(null)} />
      )}
      {modal === "deliveryBreakdown" && (
        <DeliveryBreakdownModal
          rows={deliveryBreakdown}
          dateLabel={logDate || today}
          onClose={() => setModal(null)}
        />
      )}
    </div>
  );
}
