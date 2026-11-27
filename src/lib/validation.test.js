import { describe, it, expect } from "vitest";
import {
  validateCustomerForm,
  validateImportForm,
  parseImportValues,
  parseOptionalRate,
  resolveBrandName,
  findDuplicateBrand,
  normalizeBrandRates,
  validateBrandName,
  validateBrandRates,
} from "./validation.js";

describe("validateCustomerForm", () => {
  it("returns null for valid input", () => {
    expect(
      validateCustomerForm({
        name: "Ramesh Sharma",
        address: "14 Shivaji Nagar",
        phone: "9876543210",
      }),
    ).toBeNull();
  });

  it("allows empty phone", () => {
    expect(
      validateCustomerForm({ name: "Ramesh", address: "14 Lane" }),
    ).toBeNull();
  });

  it("rejects missing name or address", () => {
    expect(validateCustomerForm({ name: "  ", address: "14 Lane" })).toBe(
      "Name is required",
    );
    expect(validateCustomerForm({ name: "Ramesh", address: "" })).toBe(
      "Address is required",
    );
  });

  it("rejects invalid phone after stripping non-digits", () => {
    expect(
      validateCustomerForm({
        name: "Ramesh",
        address: "14 Lane",
        phone: "98765-432",
      }),
    ).toBe("Enter valid 10-digit phone");
  });
});

describe("validateImportForm", () => {
  const valid = {
    date: "2025-01-15",
    brand: "Amul",
    type: "Full Cream",
    qty: 100,
    rate: 36,
  };

  it("returns null for valid import", () => {
    expect(validateImportForm(valid)).toBeNull();
  });

  it("rejects missing required fields", () => {
    expect(
      validateImportForm({
        brand: "Amul",
        type: "Full Cream",
        qty: 1,
        rate: 1,
      }),
    ).toBe("Fill required fields");
  });

  it("rejects invalid quantity and rate", () => {
    expect(validateImportForm({ ...valid, qty: 0 })).toBe("Invalid quantity");
    expect(validateImportForm({ ...valid, qty: 10000 })).toBe(
      "Invalid quantity",
    );
    expect(validateImportForm({ ...valid, rate: 0 })).toBe("Invalid rate");
  });
});

describe("parseImportValues", () => {
  it("computes rounded total from qty and rate", () => {
    expect(parseImportValues({ qty: 100, rate: 36.555 })).toEqual({
      qty: 100,
      rate: 36.555,
      total: 3655.5,
    });
  });

  it("defaults missing values to zero", () => {
    expect(parseImportValues({})).toEqual({ qty: 0, rate: 0, total: 0 });
  });
});

describe("parseOptionalRate", () => {
  it("returns null for empty values", () => {
    expect(parseOptionalRate(undefined)).toBeNull();
    expect(parseOptionalRate("")).toBeNull();
  });

  it("parses numeric strings", () => {
    expect(parseOptionalRate("36.5")).toBe(36.5);
    expect(parseOptionalRate(40)).toBe(40);
  });
});

describe("brand validation", () => {
  it("resolves the name from the form or the edit target", () => {
    expect(resolveBrandName({ name: "Amul" })).toBe("Amul");
    expect(resolveBrandName({ brandName: "Amul" })).toBe("Amul");
    expect(resolveBrandName({}, { name: "Amul" })).toBe("Amul");
    expect(resolveBrandName({}, { brandName: "Amul" })).toBe("Amul");
    expect(resolveBrandName({}, {})).toBe("");
  });

  it("flags a duplicate name but lets an edit keep its own name", () => {
    const brands = [
      { id: "B1", name: "Amul" },
      { id: "B2", name: "Mother Dairy" },
    ];
    expect(findDuplicateBrand(brands, "amul", undefined)?.id).toBe("B1");
    expect(findDuplicateBrand(brands, "  AMUL  ", "B2")?.id).toBe("B1");
    expect(findDuplicateBrand(brands, "Amul", "B1")).toBeUndefined();
    expect(findDuplicateBrand(brands, "New Brand", undefined)).toBeUndefined();
    expect(findDuplicateBrand(undefined, "Amul")).toBeUndefined();
  });

  it("normalizes the rates array and the legacy single-rate shape", () => {
    expect(
      normalizeBrandRates({
        rates: [
          { milkType: "Full Cream", rate: 60 },
          { milkType: "  ", rate: 55 },
        ],
      }),
    ).toEqual([{ milkType: "Full Cream", rate: 60 }]);
    expect(normalizeBrandRates({ rate: "55" })).toEqual([
      { milkType: "Full Cream", rate: 55 },
    ]);
    expect(normalizeBrandRates({ rate: "", rates: undefined })).toEqual([]);
    expect(normalizeBrandRates({})).toEqual([]);
  });

  it("validates the brand name", () => {
    expect(validateBrandName("Amul")).toBeNull();
    expect(validateBrandName("")).toBe("Brand name is required");
    expect(validateBrandName("   ")).toBe("Brand name is required");
    expect(validateBrandName(undefined)).toBe("Brand name is required");
  });

  it("requires at least one rate", () => {
    expect(validateBrandRates([])).toBe(
      "Enter a rate for at least one milk type",
    );
    expect(validateBrandRates(undefined)).toBe(
      "Enter a rate for at least one milk type",
    );
  });

  it("rejects duplicate milk types, empty rates, and non-positive rates", () => {
    expect(
      validateBrandRates([
        { milkType: "Full Cream", rate: 60 },
        { milkType: "Full Cream", rate: 70 },
      ]),
    ).toBe('"Full Cream" already has a rate for this brand');
    expect(validateBrandRates([{ milkType: "Toned", rate: "" }])).toBe(
      'Enter a rate for "Toned"',
    );
    expect(validateBrandRates([{ milkType: "Toned", rate: null }])).toBe(
      'Enter a rate for "Toned"',
    );
    expect(validateBrandRates([{ milkType: "Toned", rate: 0 }])).toBe(
      'Enter a rate greater than 0 for "Toned"',
    );
    expect(validateBrandRates([{ milkType: "Toned", rate: -1 }])).toBe(
      'Enter a rate greater than 0 for "Toned"',
    );
    expect(validateBrandRates([{ milkType: "Toned", rate: Number.NaN }])).toBe(
      'Enter a rate greater than 0 for "Toned"',
    );
  });

  it("accepts a valid multi-type rate list", () => {
    expect(
      validateBrandRates([
        { milkType: "Full Cream", rate: 60 },
        { milkType: "Toned", rate: 55 },
      ]),
    ).toBeNull();
  });
});
