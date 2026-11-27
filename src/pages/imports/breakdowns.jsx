// Page-local breakdown presenters for the Imports page (2026-11-09 F16 — the
// thead/tbody markup was cloned verbatim between the two modals, so the table
// lives here once). Rows are shaped by lib/breakdowns.js.

import { fmt } from "../../lib/utils.js";
import { Modal } from "../../components/ui.jsx";

// First two columns left-aligned, the rest right.
// Module-local: only the two modals below render it.
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

export function QtyBreakdownModal({ rows, onClose }) {
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

export function DeliveryBreakdownModal({ rows, dateLabel, onClose }) {
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
