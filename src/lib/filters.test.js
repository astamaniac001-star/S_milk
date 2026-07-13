import { describe, it, expect } from "vitest";
import { filterCustomers, filterImports, filterBills } from "./filters.js";

const customers = [
  {
    id: "C1",
    name: "Ramesh Sharma",
    address: "14 Shivaji Nagar",
    phone: "9876543210",
    status: "Active",
  },
  {
    id: "C2",
    name: "Priya Patel",
    address: "22 MG Road",
    phone: "9123456789",
    status: "Inactive",
  },
  {
    id: "C3",
    name: "Amit Kumar",
    address: "Shivaji Colony",
    phone: "9988776655",
    status: "Paused",
  },
];

const imports = [
  { id: "I1", date: "2025-01-15", brand: "Amul", status: "Draft" },
  { id: "I2", date: "2025-02-10", brand: "Mother Dairy", status: "Confirmed" },
  { id: "I3", date: "2025-01-20", brand: "Amul", status: "Confirmed" },
];

const bills = [
  { id: "B1", status: "Paid" },
  { id: "B2", status: "Unpaid" },
  { id: "B3", status: "Partial" },
];

describe("filterCustomers", () => {
  it("returns all customers when search is empty and filter is All", () => {
    expect(filterCustomers(customers, "", "All")).toHaveLength(3);
  });

  it("matches name, address, or phone case-insensitively", () => {
    expect(filterCustomers(customers, "ramesh", "All")).toEqual([customers[0]]);
    expect(filterCustomers(customers, "mg road", "All")).toEqual([
      customers[1],
    ]);
    expect(filterCustomers(customers, "9876543210", "All")).toEqual([
      customers[0],
    ]);
    expect(filterCustomers(customers, "shivaji", "All")).toHaveLength(2);
  });

  it("filters by status when not All", () => {
    expect(filterCustomers(customers, "", "Active")).toEqual([customers[0]]);
    expect(filterCustomers(customers, "", "Inactive")).toEqual([customers[1]]);
    expect(filterCustomers(customers, "shivaji", "Paused")).toEqual([
      customers[2],
    ]);
  });

  it("returns empty when search and status do not match together", () => {
    expect(filterCustomers(customers, "ramesh", "Inactive")).toEqual([]);
  });
});

describe("filterImports", () => {
  it("returns all imports when every filter is empty", () => {
    expect(
      filterImports(imports, { month: "", brand: "", status: "" }),
    ).toHaveLength(3);
  });

  it("filters by brand, status, and month prefix independently", () => {
    expect(
      filterImports(imports, { month: "", brand: "Amul", status: "" }),
    ).toHaveLength(2);
    expect(
      filterImports(imports, { month: "", brand: "", status: "Confirmed" }),
    ).toHaveLength(2);
    expect(
      filterImports(imports, { month: "2025-01", brand: "", status: "" }),
    ).toHaveLength(2);
    expect(
      filterImports(imports, {
        month: "2025-01",
        brand: "Amul",
        status: "Confirmed",
      }),
    ).toEqual([imports[2]]);
  });
});

describe("filterBills", () => {
  it('returns all bills when filter is "All"', () => {
    expect(filterBills(bills, "All")).toEqual(bills);
  });

  it("filters by bill status", () => {
    expect(filterBills(bills, "Paid")).toEqual([bills[0]]);
    expect(filterBills(bills, "Unpaid")).toEqual([bills[1]]);
    expect(filterBills(bills, "Partial")).toEqual([bills[2]]);
  });
});
