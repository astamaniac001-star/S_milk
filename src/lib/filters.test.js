import { describe, it, expect } from "vitest";
import {
  filterCustomers,
  filterImports,
  filterBills,
  buildMonthOptions,
  defaultImportRange,
} from "./filters.js";

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

  it("searches by customer name, month, or status", () => {
    const rows = [
      { id: "B1", custId: "C1", month: "2026-11", status: "Unpaid", amount: 100, paid: 0 },
      { id: "B2", custId: "C2", month: "2026-10", status: "Paid", amount: 200, paid: 200 },
    ];
    const names = new Map([
      ["C1", "Ramesh Sharma"],
      ["C2", "Priya Patel"],
    ]);
    expect(filterBills(rows, "All", "ramesh", names).map((b) => b.id)).toEqual([
      "B1",
    ]);
    expect(filterBills(rows, "All", "2026-10", names).map((b) => b.id)).toEqual([
      "B2",
    ]);
    expect(filterBills(rows, "All", "unpaid", names).map((b) => b.id)).toEqual([
      "B1",
    ]);
    expect(filterBills(rows, "All", "nobody", names)).toEqual([]);
  });

  it("composes search with the status filter", () => {
    const rows = [
      { id: "B1", custId: "C1", month: "2026-11", status: "Unpaid", amount: 100, paid: 0 },
      { id: "B2", custId: "C1", month: "2026-11", status: "Paid", amount: 200, paid: 200 },
    ];
    const names = new Map([["C1", "Ramesh"]]);
    expect(
      filterBills(rows, "Paid", "ramesh", names).map((b) => b.id),
    ).toEqual(["B2"]);
  });

  it("sorts by newest month, highest due, or customer name without mutating input", () => {
    const rows = [
      { id: "B1", custId: "C2", month: "2026-10", status: "Unpaid", amount: 100, paid: 40 },
      { id: "B2", custId: "C1", month: "2026-11", status: "Unpaid", amount: 300, paid: 0 },
      { id: "B3", custId: "C3", month: "2026-11", status: "Paid", amount: 50, paid: 50 },
    ];
    const names = new Map([
      ["C1", "Amit"],
      ["C2", "Zara"],
      ["C3", "Mohan"],
    ]);
    expect(filterBills(rows, "All", "", names, "newest").map((b) => b.id)).toEqual([
      "B2",
      "B3",
      "B1",
    ]);
    expect(filterBills(rows, "All", "", names, "due").map((b) => b.id)).toEqual([
      "B2",
      "B1",
      "B3",
    ]);
    expect(filterBills(rows, "All", "", names, "name").map((b) => b.id)).toEqual([
      "B2",
      "B3",
      "B1",
    ]);
    expect(rows.map((b) => b.id)).toEqual(["B1", "B2", "B3"]);
  });

  it("returns a safe empty list for missing input", () => {
    expect(filterBills(undefined, "All")).toEqual([]);
    expect(filterBills(null, "Paid")).toEqual([]);
  });
});

describe("buildMonthOptions", () => {
  it("returns unique months, newest first, with human labels", () => {
    expect(buildMonthOptions(imports)).toEqual([
      { value: "2025-02", label: "Feb 2025" },
      { value: "2025-01", label: "Jan 2025" },
    ]);
  });

  it("deduplicates repeated months and sorts correctly across years", () => {
    const rows = [
      { date: "2025-01-05" },
      { date: "2025-01-25" },
      { date: "2024-12-30" },
      { date: "2025-03-02" },
    ];
    expect(buildMonthOptions(rows).map((m) => m.value)).toEqual([
      "2025-03",
      "2025-01",
      "2024-12",
    ]);
  });

  it("ignores rows with malformed or missing dates", () => {
    const rows = [{ date: "2025-01-15" }, { date: "garbage" }, {}, null];
    expect(buildMonthOptions(rows)).toEqual([
      { value: "2025-01", label: "Jan 2025" },
    ]);
  });

  it("returns empty for no imports", () => {
    expect(buildMonthOptions([])).toEqual([]);
    expect(buildMonthOptions(undefined)).toEqual([]);
  });
});

describe("filterImports — day & range modes (Imports Day/Range views)", () => {
  const rows = [
    { brand: "Amul", status: "Confirmed", date: "2026-11-03" },
    { brand: "Amul", status: "Draft", date: "2026-10-20" },
    { brand: "MD", status: "Confirmed", date: "2026-10-31" },
    { brand: "MD", status: "Confirmed", date: "2025-12-15" },
  ];

  it("day mode matches the exact date", () => {
    const out = filterImports(rows, { mode: "day", day: "2026-10-20" });
    expect(out.map((r) => r.date)).toEqual(["2026-10-20"]);
  });

  it("day mode composes with brand/status filters", () => {
    expect(
      filterImports(rows, {
        mode: "day",
        day: "2026-11-03",
        brand: "Amul",
      }).length,
    ).toBe(1);
    expect(
      filterImports(rows, { mode: "day", day: "2026-11-03", brand: "MD" }),
    ).toEqual([]);
  });

  it("day mode with an empty day imposes no date constraint", () => {
    expect(filterImports(rows, { mode: "day", day: "" })).toEqual(rows);
  });

  it("range mode is inclusive on both bounds", () => {
    const out = filterImports(rows, {
      mode: "range",
      from: "2026-10-01",
      to: "2026-11-30",
    });
    expect(out.map((r) => r.date)).toEqual([
      "2026-11-03",
      "2026-10-20",
      "2026-10-31",
    ]);
  });

  it("range mode works with only one bound set", () => {
    expect(
      filterImports(rows, { mode: "range", from: "2026-10-01" }).map(
        (r) => r.date,
      ),
    ).toEqual(["2026-11-03", "2026-10-20", "2026-10-31"]);
    expect(
      filterImports(rows, { mode: "range", to: "2025-12-31" }).map(
        (r) => r.date,
      ),
    ).toEqual(["2025-12-15"]);
  });

  it("range mode excludes malformed dates while a bound is active", () => {
    const bad = [{ date: "garbage" }, { date: "2026-10-05" }];
    expect(
      filterImports(bad, {
        mode: "range",
        from: "2026-10-01",
        to: "2026-10-31",
      }).map((r) => r.date),
    ).toEqual(["2026-10-05"]);
  });

  it("month mode is unchanged: empty month shows all, prefix filters otherwise", () => {
    expect(filterImports(rows, { month: "" })).toEqual(rows);
    expect(
      filterImports(rows, { month: "2026-10" }).map((r) => r.date),
    ).toEqual(["2026-10-20", "2026-10-31"]);
  });

  it("month mode still guards malformed UI rows", () => {
    expect(filterImports([{ date: undefined }], { month: "2026-10" })).toEqual(
      [],
    );
  });
});

describe("defaultImportRange — previous month → today window", () => {
  it("covers the first of the previous month through today", () => {
    expect(defaultImportRange("2026-11-10")).toEqual({
      from: "2026-10-01",
      to: "2026-11-10",
    });
  });

  it("rolls Dec → Jan back across the year boundary", () => {
    expect(defaultImportRange("2026-01-05")).toEqual({
      from: "2025-12-01",
      to: "2026-01-05",
    });
  });

  it("tolerates a malformed or absent today", () => {
    expect(defaultImportRange("garbage")).toEqual({ from: "", to: "" });
    expect(defaultImportRange(undefined)).toEqual({ from: "", to: "" });
  });
});
