// Day-view stock card: daily inventory from getDailyInventory (Confirmed
// imports only). Fetched by useEntityStore whenever the operator is in Day
// mode with a date picked; the fetch is wired at the composition root
// (useAppState → useEntityStore importDay).
//
// Only trust an inventory payload that belongs to the currently-selected day —
// the payload carries its own `date`, so a stale payload from a previously
// viewed day renders as "loading" instead of showing wrong numbers.

import { toNum } from "../../lib/utils.js";
import { CalendarRange } from "lucide-react";

export function DayStockCard({ day, inventory }) {
  const dayInventory =
    day && inventory && inventory.date === day ? inventory : null;

  return (
    <div className="stock-card">
      <div className="stock-head">
        <span className="stock-title">
          <CalendarRange size={14} aria-hidden="true" /> Stock for{" "}
          {day || "— pick a date"}
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
          <div className="stock-note">
            Imported counts Confirmed imports only.
          </div>
        </>
      ) : (
        <div className="stock-note">
          {day ? "Loading stock…" : "Pick a date to see that day's stock."}
        </div>
      )}
    </div>
  );
}
