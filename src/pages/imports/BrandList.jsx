// Brands section of the Imports page: the heading + the BrandImportRow list.
// "+ Brand to add one" empty state matches the Copy CTA wording.

import { Empty } from "../../components/ui.jsx";
import { Tag } from "lucide-react";
import { BrandImportRow } from "./BrandImportRow.jsx";

export function BrandList({ brands = [], today, onSaveImport, onOpenModal }) {
  return (
    <>
      <div className="section-head" style={{ marginTop: 18 }}>
        <h3 className="card-head-title">
          <Tag size={14} aria-hidden="true" /> Brands
        </h3>
      </div>
      {brands.length === 0 ? (
        <Empty msg="No brands yet. Tap + Brand to add one." icon={Tag} />
      ) : (
        <div className="list">
          {brands.map((b) => (
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
    </>
  );
}
