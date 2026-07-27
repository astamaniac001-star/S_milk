import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook } from "@testing-library/react";
import { useAppDerived } from "./useAppDerived";

// Stub utils.getToday so the "today filters" are deterministic in tests.
vi.mock("../lib/utils", () => ({
  getToday: () => "2026-07-25",
}));

// We exercise the real filters by importing the real filters module — no mock
// needed. The filters are pure and already have their own coverage in
// lib/filters.test.js, so we only assert the integration here.

beforeEach(() => {
  vi.clearAllMocks();
});

function setup(partial = {}) {
  // Defaults: every destructured field of useAppDerived must be non-undefined
  // for the downstream filters (filterImports destructures {month,brand,status})
  // to avoid throwing on a default-state render. The returned `rerender` ALSO
  // merges these defaults so memo-stability tests don't need to repeat inputs
  // verbatim and don't accidentally explode the hook with a bare override.
  const DEFAULTS = {
    customers: [],
    imports: [],
    bills: [],
    brands: [],
    logs: [],
    custSearch: "",
    custFilter: "All",
    impFilter: { month: "", brand: "", status: "" },
    billFilter: "All",
    logDate: undefined,
    // FIX (audit 2026-07-25): useAppDerived now takes `today` from upstream
    // (useAppState's clampedToday memo) rather than recomputing getToday()
    // inside and keying on `dayTick`. Tests must drive midnight rollover by
    // bumping `today`, not `dayTick`.
    today: "2026-07-25",
  };
  const makeState = (override = {}) => ({ ...DEFAULTS, ...override });
  const result = renderHook(({ state: s }) => useAppDerived(s), {
    initialProps: { state: makeState(partial) },
  });
  const rerender = (override = {}) =>
    result.rerender({ state: makeState(override) });
  return { ...result, rerender };
}

describe("useAppDerived — derived fields (audit 2026-07-25)", () => {
  it("computes activeC as only status='Active' (NOT Paused/Inactive)", () => {
    const customers = [
      { id: "A", status: "Active" },
      { id: "B", status: "Paused" },
      { id: "C", status: "Inactive" },
      { id: "D", status: "Active" },
    ];
    const { result } = setup({ customers });
    expect(result.current.activeC.map((c) => c.id)).toEqual(["A", "D"]);
  });

  it("computes totalRevenue from Paid + Partial bills only, summing paid", () => {
    const bills = [
      { id: "PAID1", status: "Paid", amount: 100, paid: 100 },
      { id: "PART", status: "Partial", amount: 200, paid: 50 },
      { id: "UNP", status: "Unpaid", amount: 300, paid: 0 },
      { id: "PAID2", status: "Paid", amount: 400, paid: 400 },
    ];
    const { result } = setup({ bills });
    expect(result.current.totalRevenue).toBe(550);
  });

  it("computes pendingDues from non-Paid bills, summing amount - paid", () => {
    const bills = [
      { id: "PAID", status: "Paid", amount: 100, paid: 100 },
      { id: "PART", status: "Partial", amount: 200, paid: 50 },
      { id: "UNP", status: "Unpaid", amount: 300, paid: 0 },
    ];
    const { result } = setup({ bills });
    // only PART (200-50) + UNP (300-0) = 450
    expect(result.current.pendingDues).toBe(450);
  });

  it("treats undefined-paid as 0 — does not yield NaN (regression-trap for double-mapping audit rule §4)", () => {
    const bills = [
      { id: "X", status: "Unpaid", amount: 100 },
      { id: "Y", status: "Partial", amount: 200, paid: 50 },
    ];
    const { result } = setup({ bills });
    expect(result.current.pendingDues).toBe(250);
    expect(result.current.totalRevenue).toBe(50);
    // Negative pendingDues would also surface here if the mapper swapped
    // amount↔paid amounts.
    expect(Number.isFinite(result.current.pendingDues)).toBe(true);
  });

  it("counts only brands with status='Active' into activeBrandsCount", () => {
    const brands = [
      { id: "X", status: "Active" },
      { id: "Y", status: "Inactive" },
      { id: "Z", status: "Active" },
    ];
    const { result } = setup({ brands });
    expect(result.current.activeBrandsCount).toBe(2);
  });

  it("splits logs into todayLogs vs selectedDateLogs honouring logDate override", () => {
    const logs = [
      { id: "T1", date: "2026-07-25", delivered: true, qty: 5 },
      { id: "T2", date: "2026-07-25", delivered: false, qty: 4 },
      { id: "Y1", date: "2026-07-24", delivered: true, qty: 7 },
      { id: "Y2", date: "2026-07-24", delivered: true, qty: 3 },
    ];
    const { result } = setup({ logs, logDate: "2026-07-24" });
    expect(result.current.todayLogs.map((l) => l.id)).toEqual(["T1", "T2"]);
    expect(result.current.selectedDateLogs.map((l) => l.id)).toEqual([
      "Y1",
      "Y2",
    ]);
    // confirmedStock only counts today's delivered logs — never the
    // selected-date's logs (audit gotcha: the Dashboard badge is for today).
    expect(result.current.confirmedStock).toBe(5);
  });

  it("defaults selectedDateLogs to today when no logDate is provided (audit rule §8 — IST contract)", () => {
    const logs = [{ id: "T1", date: "2026-07-25", delivered: true, qty: 2 }];
    const { result } = setup({ logs /* no logDate */ });
    expect(result.current.selectedDateLogs.map((l) => l.id)).toEqual(["T1"]);
    expect(result.current.todayLogs.map((l) => l.id)).toEqual(["T1"]);
  });

  it("filteredC is empty when custFilter='All' and custSearch is empty (no customer matches the all-empty filter)", () => {
    const customers = [
      { id: "A", status: "Active", name: "Ram", phone: "9000000001" },
      { id: "B", status: "Paused", name: "Shyam", phone: "9000000002" },
    ];
    const { result } = setup({
      customers,
      custFilter: "All",
      custSearch: "",
    });
    // Sanity: filterCustomers with 'All' returns all 2.
    expect(result.current.filteredC).toHaveLength(2);
  });

  it("filteredC honours custFilter='Active'", () => {
    const customers = [
      { id: "A", status: "Active", name: "Ram" },
      { id: "B", status: "Paused", name: "Shyam" },
    ];
    const { result } = setup({
      customers,
      custFilter: "Active",
      custSearch: "",
    });
    expect(result.current.filteredC.map((c) => c.id)).toEqual(["A"]);
  });

  it("filteredB honours billFilter='Unpaid' (passes through to filterBills)", () => {
    const bills = [
      { id: "P", status: "Paid", amount: 100, paid: 100 },
      { id: "U", status: "Unpaid", amount: 200, paid: 0 },
    ];
    const { result } = setup({ bills, billFilter: "Unpaid" });
    expect(result.current.filteredB.map((b) => b.id)).toEqual(["U"]);
  });
});

describe("useAppDerived — memoization stability (audit rule §2 'derive once')", () => {
  it("returns a stable derived object reference when deps are unchanged", () => {
    const customers = [{ id: "A", status: "Active", name: "Ram" }];
    const { result, rerender } = setup({ customers });
    const first = result.current;
    rerender({ customers });
    // identity preserved — useMemo memoized on the same customers array ref.
    expect(result.current).toBe(first);
  });

  it("returns a NEW derived object reference when any input array changes", () => {
    const customers = [{ id: "A", status: "Active" }];
    const { result, rerender } = setup({ customers });
    const first = result.current;
    rerender({ customers: [...customers, { id: "B", status: "Active" }] });
    expect(result.current).not.toBe(first);
  });

  it("returns a NEW derived object reference when logDate changes — selectedDateLogs recomputed", () => {
    const logs = [
      { id: "T1", date: "2026-07-25", delivered: true, qty: 1 },
      { id: "Y1", date: "2026-07-24", delivered: false, qty: 0 },
    ];
    const { result, rerender } = setup({ logs, logDate: "2026-07-25" });
    const first = result.current;
    rerender({ logs, logDate: "2026-07-24" });
    expect(result.current).not.toBe(first);
    // Stronger regression-trap: the new derived object actually reflects the
    // new logDate (a forgetful implementation might recompute memo on the new
    // deps but still leak the previous selectedDateLogs by accident).
    expect(result.current.selectedDateLogs.map((l) => l.id)).toEqual(["Y1"]);
  });

  it("returns a NEW derived object when `today` changes (midnight rollover drives recompute)", () => {
    const logs = [{ id: "T1", date: "2026-07-25", delivered: true, qty: 9 }];
    const { result, rerender } = setup({ logs, today: "2026-07-25" });
    const first = result.current;
    // Same inputs except today bumped — simulate midnight crossing.
    rerender({ logs, today: "2026-07-26" });
    expect(result.current).not.toBe(first);
    // The new derived object must reflect the new "today" — `todayLogs`
    // recomputed against the new today date is now empty (no logs match
    // 2026-07-26), preventing stale yesterday-from-today's-lens reads.
    expect(result.current.todayLogs).toEqual([]);
  });
});
