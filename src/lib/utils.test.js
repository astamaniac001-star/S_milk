import { describe, it, expect } from "vitest";
import { matchBrandByMilkType } from "./utils.js";

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
