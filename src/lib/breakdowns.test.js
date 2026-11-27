import { describe, it, expect } from "vitest";
import {
  buildQuantityBreakdown,
  buildStockBreakdown,
  sortBrandTypeRows,
} from "./breakdowns.js";

const BRANDS = [
  { id: "B1", name: "Amul", defaultMilkType: "Full Cream" },
  { id: "B2", name: "Mother Dairy", defaultMilkType: "Toned" },
];

describe("sortBrandTypeRows", () => {
  it("sorts by brand, then type", () => {
    const rows = [
      { brand: "Mother Dairy", type: "Toned" },
      { brand: "Amul", type: "Toned" },
      { brand: "Amul", type: "Full Cream" },
    ];
    expect(sortBrandTypeRows(rows).map((r) => `${r.brand}/${r.type}`)).toEqual([
      "Amul/Full Cream",
      "Amul/Toned",
      "Mother Dairy/Toned",
    ]);
  });
});

describe("buildQuantityBreakdown", () => {
  it("aggregates qty and cost per brand/type", () => {
    const rows = buildQuantityBreakdown([
      { brand: "Amul", type: "Full Cream", qty: 10, total: 300 },
      { brand: "Amul", type: "Full Cream", qty: 5, total: 150 },
      { brand: "Amul", type: "Toned", qty: 2, total: 50 },
    ]);
    expect(rows).toEqual([
      { brand: "Amul", type: "Full Cream", qty: 15, cost: 450 },
      { brand: "Amul", type: "Toned", qty: 2, cost: 50 },
    ]);
  });

  it("coerces string quantities/costs and defaults a missing type", () => {
    const rows = buildQuantityBreakdown([
      { brand: "Amul", type: undefined, qty: "3", total: "90" },
    ]);
    expect(rows).toEqual([{ brand: "Amul", type: "Mixed", qty: 3, cost: 90 }]);
  });

  it("returns an empty list for null/undefined input", () => {
    expect(buildQuantityBreakdown(null)).toEqual([]);
    expect(buildQuantityBreakdown(undefined)).toEqual([]);
  });
});

describe("buildStockBreakdown", () => {
  const imports = [
    {
      id: "I1",
      date: "2026-11-03",
      brand: "Amul",
      type: "Full Cream",
      qty: 40,
      status: "Confirmed",
    },
    {
      id: "I2",
      date: "2026-11-03",
      brand: "Amul",
      type: "Full Cream",
      qty: 10,
      status: "Draft",
    },
    {
      id: "I3",
      date: "2026-11-04",
      brand: "Mother Dairy",
      type: "Toned",
      qty: 20,
      status: "Confirmed",
    },
  ];

  it("counts Confirmed imports only and aggregates delivered logs", () => {
    const { rows, totals } = buildStockBreakdown({
      imports,
      logs: [
        {
          date: "2026-11-03",
          qty: 25,
          delivered: true,
          product: "Full Cream",
          brandId: "B1",
        },
        {
          date: "2026-11-03",
          qty: 5,
          delivered: false,
          product: "Full Cream",
          brandId: "B1",
        },
      ],
      brands: BRANDS,
      date: "2026-11-03",
    });
    expect(rows).toEqual([
      {
        brand: "Amul",
        type: "Full Cream",
        imported: 40,
        delivered: 25,
        balance: 15,
      },
    ]);
    expect(totals).toEqual({ imported: 40, delivered: 25 });
  });

  it("resolves a log's brand by id (brand-aware) and falls back to milk type", () => {
    const { rows } = buildStockBreakdown({
      imports: [],
      logs: [
        {
          date: "2026-11-03",
          qty: 2,
          delivered: true,
          product: "Full Cream",
          brandId: "B1",
        },
        {
          date: "2026-11-03",
          qty: 1,
          delivered: true,
          product: "Toned",
        },
      ],
      brands: BRANDS,
      date: "2026-11-03",
    });
    expect(rows).toEqual([
      {
        brand: "Amul",
        type: "Full Cream",
        imported: 0,
        delivered: 2,
        balance: -2,
      },
      {
        brand: "Mother Dairy",
        type: "Toned",
        imported: 0,
        delivered: 1,
        balance: -1,
      },
    ]);
  });

  it("ignores logs for other dates when filterLogsByDate is true", () => {
    const { rows } = buildStockBreakdown({
      imports: [],
      logs: [
        { date: "2026-11-03", qty: 2, delivered: true, product: "Toned" },
        { date: "2026-11-04", qty: 9, delivered: true, product: "Toned" },
      ],
      brands: BRANDS,
      date: "2026-11-03",
    });
    expect(rows[0].delivered).toBe(2);
  });

  it("does not re-filter logs by date when filterLogsByDate is false", () => {
    const { rows } = buildStockBreakdown({
      imports: [],
      logs: [
        { date: "2026-11-03", qty: 2, delivered: true, product: "Toned" },
        { date: "2026-11-04", qty: 9, delivered: true, product: "Toned" },
      ],
      brands: BRANDS,
      date: "2026-11-03",
      filterLogsByDate: false,
    });
    expect(rows[0].delivered).toBe(11);
  });

  it("returns empty rows/totals for empty inputs", () => {
    expect(buildStockBreakdown({ date: "2026-11-03" })).toEqual({
      rows: [],
      totals: { imported: 0, delivered: 0 },
    });
  });
});
