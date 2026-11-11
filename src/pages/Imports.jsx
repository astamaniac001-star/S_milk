// ── Imports.jsx ───────────────────────────────────────────────────────────────
import { useRef, useState, useMemo } from "react";
import { fmt, getToday, toNum, brandLabel } from "../lib/utils.js";
import { buildMonthOptions, defaultImportRange } from "../lib/filters.js";
import {
  Card,
  Btn,
  IS,
  Section,
  StatGrid,
  Empty,
  Badge,
  Modal,
} from "../components/ui.jsx";

const STATUS_FILTERS = ["Draft", "Confirmed", "Reconciled"];

// Shared sort: brand name, then milk type (audit 2026-11-09 F16 — the
// sort expression was cloned between buildQuantityBreakdown and
// buildImportDeliveryBreakdown).
function sortBrandTypeRows(rows) {
  return rows.sort((a, b) =>
    a.brand === b.brand
      ? a.type.localeCompare(b.type)
      : a.brand.localeCompare(b.brand),
  );
}

function buildQuantityBreakdown(imports) {
  const map = new Map();
  (imports || []).forEach((i) => {
    const key = `${i.brand}||${i.type}`;
    if (!map.has(key))
      map.set(key, { brand: i.brand, type: i.type, qty: 0, cost: 0 });
    const row = map.get(key);
    row.qty += toNum(i.qty);
    row.cost += toNum(i.total);
  });
  return sortBrandTypeRows(Array.from(map.values()));
}

// Same logic as Delivery.jsx's buildTotalBreakdown but for the Imports modal:
// aggregates imports (qty) + today's delivered logs by brand/type.
function buildImportDeliveryBreakdown(imports, logs, brands, logDate, today) {
  const targetDate = logDate || today;
  const dayImports = (imports || []).filter(
    (i) => i.status === "Confirmed" && i.date === targetDate,
  );
  const deliveredLogs = (logs || []).filter(
    (l) => l.delivered && l.date === targetDate,
  );

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
  return sortBrandTypeRows(rows);
}

// Shared table for the two breakdown modals (audit 2026-11-09 F16 — the
// thead/tbody markup was cloned verbatim between QtyBreakdownModal and
// DeliveryBreakdownModal). First two columns left-aligned, the rest right.
function BreakdownTable({ headers, rows, renderCells }) {
  return (
    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
      <thead>
        <tr style={{ borderBottom: "2px solid var(--border-color)" }}>
          {headers.map((h, i) => (
            <th
              key={h}
              style={{ padding: "6px", textAlign: i < 2 ? "left" : "right" }}
            >
              {h}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((r, i) => (
          <tr key={i} style={{ borderBottom: "1px solid var(--border-color)" }}>
            {renderCells(r)}
          </tr>
        ))}
      </tbody>
    </table>
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
            <td style={{ padding: "6px", fontWeight: 600 }}>{r.brand}</td>
            <td style={{ padding: "6px" }}>{r.type}</td>
            <td style={{ padding: "6px", textAlign: "right" }}>{r.qty}</td>
            <td style={{ padding: "6px", textAlign: "right" }}>
              {fmt(r.cost)}
            </td>
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
            <td style={{ padding: "6px", fontWeight: 600 }}>{r.brand}</td>
            <td style={{ padding: "6px" }}>{r.type}</td>
            <td style={{ padding: "6px", textAlign: "right" }}>{r.imported}</td>
            <td style={{ padding: "6px", textAlign: "right" }}>
              {r.delivered}
            </td>
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
            style={{
              fontSize: 16,
              fontWeight: 700,
              color: "var(--text-primary, #0f172a)",
            }}
          >
            {brand.name}{" "}
            <span
              style={{
                fontSize: 13,
                fontWeight: 500,
                color: "var(--text-secondary, #475569)",
              }}
            >
              · {brand.defaultMilkType || "—"}
            </span>
          </div>
          <div
            style={{ fontSize: 12, color: "var(--text-secondary, #6b7280)" }}
          >
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
            <label
              style={{
                fontSize: 12,
                color: "var(--text-secondary, #475569)",
                display: "block",
                marginBottom: 4,
              }}
            >
              Date
            </label>
            <input
              type="date"
              style={IS()}
              value={form.date}
              onChange={handleChange("date")}
            />
          </div>
          <div>
            <label
              style={{
                fontSize: 12,
                color: "var(--text-secondary, #475569)",
                display: "block",
                marginBottom: 4,
              }}
            >
              Litres
            </label>
            <input
              type="number"
              style={IS()}
              value={form.qty}
              placeholder="0"
              onChange={handleChange("qty")}
            />
          </div>
          <div>
            <label
              style={{
                fontSize: 12,
                color: "var(--text-secondary, #475569)",
                display: "block",
                marginBottom: 4,
              }}
            >
              Rate (₹/L)
            </label>
            <input
              type="number"
              step="0.5"
              style={IS()}
              value={form.rate}
              placeholder="0"
              onChange={handleChange("rate")}
            />
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
  impFilter,
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

  const totalQty = safeFiltered
    .filter((i) => i.status === "Confirmed")
    .reduce((s, i) => s + Number(i.qty || 0), 0);

  const totalCost = safeFiltered
    .filter((i) => i.status === "Confirmed")
    .reduce((s, i) => s + Number(i.total || 0), 0);

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
      buildImportDeliveryBreakdown(allImports, logs, brands, logDate, today),
    [allImports, logs, brands, logDate, today],
  );

  return (
    <div>
      <Section
        title="Milk Imports"
        action={
          <div style={{ display: "flex", gap: 6 }}>
            <Btn
              small
              variant="secondary"
              onClick={() => onOpenModal("addBrand")}
            >
              + Brand
            </Btn>
            <Btn
              small
              variant="primary"
              onClick={() => onOpenModal("addImport")}
            >
              + Import
            </Btn>
          </div>
        }
      />
      <div
        style={{ display: "flex", gap: 6, marginBottom: 10, flexWrap: "wrap" }}
      >
        {/* View mode (2026-11-10): month (as before), a single day, or an
            inclusive date range. Only the active mode's picker renders, so
            the default month view is unchanged for existing flows/e2e. */}
        <select
          id="import-view"
          name="import-view"
          aria-label="Show imports by"
          value={viewMode}
          onChange={(e) => handleViewMode(e.target.value)}
          style={{ ...IS(), flex: 1 }}
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
            value={impFilter.month}
            onChange={(e) =>
              onImpFilterChange({ ...impFilter, month: e.target.value })
            }
            style={{ ...IS(), flex: 1 }}
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
            value={impFilter.day || ""}
            onChange={(e) =>
              onImpFilterChange({ ...impFilter, day: e.target.value })
            }
            style={{ ...IS(), flex: 1 }}
          />
        )}
        {viewMode === "range" && (
          <>
            <input
              type="date"
              id="import-from"
              name="import-from"
              aria-label="Show imports from date"
              value={impFilter.from || ""}
              onChange={(e) =>
                onImpFilterChange({ ...impFilter, from: e.target.value })
              }
              style={{ ...IS(), flex: 1 }}
            />
            <input
              type="date"
              id="import-to"
              name="import-to"
              aria-label="Show imports to date"
              value={impFilter.to || ""}
              onChange={(e) =>
                onImpFilterChange({ ...impFilter, to: e.target.value })
              }
              style={{ ...IS(), flex: 1 }}
            />
          </>
        )}
        <select
          id="import-brand"
          name="import-brand"
          value={impFilter.brand}
          onChange={(e) =>
            onImpFilterChange({ ...impFilter, brand: e.target.value })
          }
          style={{ ...IS(), flex: 1 }}
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
          value={impFilter.status}
          onChange={(e) =>
            onImpFilterChange({ ...impFilter, status: e.target.value })
          }
          style={{ ...IS(), flex: 1 }}
        >
          <option value="">All Status</option>
          {STATUS_FILTERS.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </div>

      {/* Day view stock card — daily inventory from getDailyInventory
          (Confirmed imports only). Fetched by useEntityStore whenever the
          operator is in Day mode with a date picked; the fetch is wired at
          the composition root (useAppState → useEntityStore importDay). */}
      {viewMode === "day" && (
        <div
          style={{
            background: "var(--info-bg, #eff6ff)",
            border: "1px solid var(--border-color, #e2e8f0)",
            borderRadius: 8,
            padding: "10px 12px",
            marginBottom: 10,
            fontSize: 13,
          }}
        >
          <div style={{ fontWeight: 700, marginBottom: 6 }}>
            Stock for {impFilter.day || "— pick a date"}
          </div>
          {dayInventory ? (
            <>
              <div style={{ display: "flex", gap: 14, flexWrap: "wrap" }}>
                <span>
                  Imported: <strong>{toNum(inventory.totalImported)} L</strong>
                </span>
                <span>
                  Delivered:{" "}
                  <strong>{toNum(inventory.totalDelivered)} L</strong>
                </span>
                <span>
                  Remaining: <strong>{toNum(inventory.remaining)} L</strong>
                </span>
                {toNum(inventory.shortage) > 0 && (
                  <span style={{ color: "#991b1b", fontWeight: 700 }}>
                    Shortage: {toNum(inventory.shortage)} L
                  </span>
                )}
              </div>
              <div
                style={{
                  fontSize: 11,
                  color: "var(--text-secondary, #6b7280)",
                  marginTop: 4,
                }}
              >
                Imported counts Confirmed imports only.
              </div>
            </>
          ) : (
            <div style={{ color: "var(--text-secondary, #6b7280)" }}>
              {impFilter.day
                ? "Loading stock…"
                : "Pick a date to see that day's stock."}
            </div>
          )}
        </div>
      )}

      {/* CLICKABLE: opens brand+type qty+price breakdown modal */}
      <div
        onClick={() => setModal("qtyBreakdown")}
        style={{ cursor: "pointer" }}
      >
        <StatGrid
          items={[
            {
              label: "Total Qty & Cost",
              value: `${totalQty} L · ${fmt(totalCost)}`,
              icon: "🥛",
              bg: "var(--info-bg)",
              tx: "var(--info-text)",
            },
            { label: "Imports", value: safeFiltered.length, icon: "📦" },
          ]}
        />
      </div>

      {/* Imported stock vs delivered milk for the selected delivery date */}
      <div
        style={{
          display: "flex",
          justifyContent: "flex-end",
          margin: "8px 0 4px",
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
        <Empty msg="No imports match filters" />
      ) : (
        safeFiltered.map((imp) => (
          <Card key={imp.id}>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "flex-start",
              }}
            >
              <div>
                <div style={{ fontWeight: 600, fontSize: 14, color: "#111" }}>
                  {imp.brand}
                </div>
                <div style={{ fontSize: 12, color: "#6b7280" }}>
                  {imp.date} · {imp.type}
                </div>
                <div style={{ fontSize: 13, color: "#374151", marginTop: 4 }}>
                  {imp.qty} L @ {fmt(imp.rate)}/L ={" "}
                  <strong>{fmt(imp.total)}</strong>
                </div>
                <div style={{ fontSize: 11, color: "#9ca3af" }}>
                  v{imp.version}
                </div>
              </div>
              <Badge label={imp.status} />
            </div>
            {imp.status === "Draft" && (
              <div style={{ display: "flex", gap: 6, marginTop: 10 }}>
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
        ))
      )}

      <div
        style={{
          fontWeight: 600,
          fontSize: 13,
          color: "#374151",
          margin: "12px 0 8px",
        }}
      >
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
        <DeliveryBreakdownModal
          rows={deliveryBreakdown}
          dateLabel={logDate || today}
          onClose={() => setModal(null)}
        />
      )}
    </div>
  );
}
