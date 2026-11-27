// Imports KPI strip: the two stat tiles (qty+cost is a real button, keyboard
// accessible, and opens the brand+type breakdown modal) plus the right-aligned
// "Imported vs Delivered" trigger. Totals are Confirmed-only by design — the
// page's filtered list drives them (callers pass the already-filtered rows).

import { fmt } from "../../lib/utils.js";
import { Btn } from "../../components/ui.jsx";
import { Droplets, Package } from "lucide-react";

export function ImportStats({
  confirmedQty = 0,
  confirmedCost = 0,
  importCount = 0,
  onOpenQtyBreakdown,
  onOpenDeliveryBreakdown,
}) {
  return (
    <>
      <div className="stat-grid">
        <button
          type="button"
          className="stat-tile"
          onClick={onOpenQtyBreakdown}
          aria-label="Open quantity and cost breakdown"
          style={{ "--accent": "var(--brand-500)" }}
        >
          <div className="stat-label">
            <Droplets size={13} aria-hidden="true" /> Total Qty & Cost
          </div>
          <div className="stat-value stat-value-compact tnum">
            {confirmedQty} L · {fmt(confirmedCost)}
          </div>
        </button>
        <div className="stat-tile" style={{ "--accent": "var(--info-text)" }}>
          <div className="stat-label">
            <Package size={13} aria-hidden="true" /> Imports
          </div>
          <div className="stat-value">{importCount}</div>
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
        <Btn small variant="ghost" onClick={onOpenDeliveryBreakdown}>
          Imported vs Delivered
        </Btn>
      </div>
    </>
  );
}
