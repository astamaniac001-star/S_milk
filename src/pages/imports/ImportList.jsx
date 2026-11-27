// One import row + its Draft-only actions (Edit / Confirm / Delete), and the
// list around them. A Draft badge-less row still renders its version pill so
// the operator can see which row an optimistic-concurrency edit targets.

import { Card, Btn, Badge } from "../../components/ui.jsx";
import { fmt } from "../../lib/utils.js";

function ImportCard({ imp, onOpenModal, onConfirm, onDelete }) {
  return (
    <Card key={imp.id}>
      <div className="import-row">
        <div className="row-main">
          <div className="row-title">
            {imp.brand}
            <span className="pill">{imp.type}</span>
          </div>
          <div className="row-sub tnum">{imp.date}</div>
          <div className="row-sub tnum">
            {imp.qty} L @ {fmt(imp.rate)}/L = <strong>{fmt(imp.total)}</strong>
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
          <Btn small variant="danger" onClick={() => onDelete(imp)}>
            Delete
          </Btn>
        </div>
      )}
    </Card>
  );
}

export function ImportList({ imports = [], onOpenModal, onConfirm, onDelete }) {
  return (
    <div className="list">
      {imports.map((imp) => (
        <ImportCard
          key={imp.id}
          imp={imp}
          onOpenModal={onOpenModal}
          onConfirm={onConfirm}
          onDelete={onDelete}
        />
      ))}
    </div>
  );
}
