import { describe, it, expect } from "vitest";
import {
  validateCustomerForm,
  validateImportForm,
  parseImportValues,
  parseOptionalRate,
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
