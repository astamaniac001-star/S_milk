import { describe, it, expect } from "vitest";
import { matchBrandByMilkType, shiftDate } from "./utils.js";

const brands = [
  { id: "B1", name: "Amul", defaultMilkType: "Full Cream" },
  { id: "B2", name: "Mother Dairy", defaultMilkType: "Toned" },
];

describe("matchBrandByMilkType", () => {
  it("matches brand by defaultMilkType from log.product", () => {
    const log = { product: "Full Cream" };
    expect(matchBrandByMilkType(log, brands)).toBe("Amul");
  });

  it("returns 'Unknown brand' when no brand matches the milk type", () => {
    const log = { product: "Organic" };
    expect(matchBrandByMilkType(log, brands)).toBe("Unknown brand");
  });

  it("defaults milk type to 'Milk' when log.product is falsy", () => {
    const log = { product: null };
    expect(matchBrandByMilkType(log, brands)).toBe("Unknown brand");
  });

  it("defaults milk type to 'Milk' when log.product is undefined", () => {
    const log = {};
    expect(matchBrandByMilkType(log, brands)).toBe("Unknown brand");
  });

  it("returns 'Unknown brand' when brands array is null", () => {
    const log = { product: "Full Cream" };
    expect(matchBrandByMilkType(log, null)).toBe("Unknown brand");
  });

  it("returns 'Unknown brand' when brands array is undefined", () => {
    const log = { product: "Full Cream" };
    expect(matchBrandByMilkType(log, undefined)).toBe("Unknown brand");
  });

  it("returns 'Unknown brand' when brands array is empty", () => {
    const log = { product: "Full Cream" };
    expect(matchBrandByMilkType(log, [])).toBe("Unknown brand");
  });

  it("skips brands whose defaultMilkType is falsy", () => {
    const brandsWithEmpty = [
      { id: "B3", name: "NoTypeBrand", defaultMilkType: null },
      ...brands,
    ];
    const log = { product: "Full Cream" };
    expect(matchBrandByMilkType(log, brandsWithEmpty)).toBe("Amul");
  });

  it("matches 'Toned' to Mother Dairy", () => {
    const log = { product: "Toned" };
    expect(matchBrandByMilkType(log, brands)).toBe("Mother Dairy");
  });
});

describe("shiftDate", () => {
  it("moves forward one day", () => {
    expect(shiftDate("2026-11-24", 1)).toBe("2026-11-25");
  });

  it("moves backward across a month boundary", () => {
    expect(shiftDate("2026-12-01", -1)).toBe("2026-11-30");
  });

  it("moves forward across a year boundary", () => {
    expect(shiftDate("2026-12-31", 1)).toBe("2027-01-01");
  });

  it("handles leap days", () => {
    expect(shiftDate("2028-02-28", 1)).toBe("2028-02-29");
    expect(shiftDate("2028-03-01", -1)).toBe("2028-02-29");
  });

  it("returns the same date for 0 days", () => {
    expect(shiftDate("2026-07-04", 0)).toBe("2026-07-04");
  });

  it("returns invalid input unchanged", () => {
    expect(shiftDate("", 1)).toBe("");
    expect(shiftDate("not-a-date", 1)).toBe("not-a-date");
    expect(shiftDate(null, 1)).toBe(null);
    expect(shiftDate("2026-07-04", "x")).toBe("2026-07-04");
  });
});
