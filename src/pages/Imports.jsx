// ── Imports.jsx ───────────────────────────────────────────────────────────────
// Milk purchases from brands/suppliers ("imports") + the per-brand quick-save
// row + the brand × type stock breakdowns. View modes: month / single day /
// inclusive date range (2026-11-10); Day mode also shows the confirmed-stock
// card fed by getDailyInventory.
//
// Composition root only: the pieces live in ./imports/ (ImportFilters,
// DayStockCard, ImportStats, ImportList, BrandList, breakdowns). This component
// owns page state (which breakdown modal is open, the delete guard) and passes
// props down — no page-local derivation of shared data (rule: pages render
// state, not derivation).

import { useRef, useState, useMemo } from "react";
import {
  buildQuantityBreakdown,
  buildStockBreakdown,
} from "../lib/breakdowns.js";
import { Btn, Empty, Section } from "../components/ui.jsx";
import { Package } from "lucide-react";
import { ImportFilters } from "./imports/ImportFilters.jsx";
import { DayStockCard } from "./imports/DayStockCard.jsx";
import { ImportStats } from "./imports/ImportStats.jsx";
import { ImportList } from "./imports/ImportList.jsx";
import { BrandList } from "./imports/BrandList.jsx";
import {
  QtyBreakdownModal,
  DeliveryBreakdownModal,
} from "./imports/breakdowns.jsx";

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

  const confirmed = safeFiltered.filter((i) => i.status === "Confirmed");
  const totalQty =
    Math.round(confirmed.reduce((s, i) => s + Number(i.qty || 0), 0) * 100) /
    100;
  const totalCost = confirmed.reduce((s, i) => s + Number(i.total || 0), 0);

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

      <ImportFilters
        impFilter={impFilter}
        allImports={allImports}
        brands={brands}
        onImpFilterChange={onImpFilterChange}
        today={today}
      />

      {/* Day view stock card — daily inventory from getDailyInventory
          (Confirmed imports only). */}
      {viewMode === "day" && (
        <DayStockCard day={impFilter.day} inventory={inventory} />
      )}

      <ImportStats
        confirmedQty={totalQty}
        confirmedCost={totalCost}
        importCount={safeFiltered.length}
        onOpenQtyBreakdown={() => setModal("qtyBreakdown")}
        onOpenDeliveryBreakdown={() => setModal("deliveryBreakdown")}
      />

      {safeFiltered.length === 0 ? (
        <Empty msg="No imports match filters" icon={Package} />
      ) : (
        <ImportList
          imports={safeFiltered}
          onOpenModal={onOpenModal}
          onConfirm={onConfirm}
          onDelete={handleDelete}
        />
      )}

      <BrandList
        brands={brands}
        today={today}
        onSaveImport={onSaveImport}
        onOpenModal={onOpenModal}
      />

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
