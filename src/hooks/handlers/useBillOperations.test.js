import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useBillOperations } from "./useBillOperations";

// Mock callApi so the handler tests are unit-level (no Supabase).
vi.mock("../../lib/api.js", () => ({
  callApi: vi.fn(),
}));

import { callApi } from "../../lib/api.js";

const CUSTOMERS = [
  { id: "C1", name: "WithSub", status: "Active" },
  { id: "C2", name: "NoSub", status: "Active" },
  { id: "C3", name: "PausedSub", status: "Active" },
  { id: "C4", name: "InactiveCustomer", status: "Inactive" },
];

const SUBSCRIPTIONS = [
  { id: "S1", customerId: "C1", isActive: true },
  { id: "S2", customerId: "C3", isActive: false },
];

function baseState(overrides = {}) {
  return {
    customers: CUSTOMERS,
    subscriptions: SUBSCRIPTIONS,
    setBills: vi.fn(),
    billMonth: "2026-08",
    toast$: vi.fn(),
    ...overrides,
  };
}

describe("useBillOperations — generateMonthlyBills (subscription-centric)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("generates a bill only for Active customers with an ACTIVE subscription", async () => {
    callApi.mockResolvedValue({ bill: { id: "B1" } });
    const s = baseState();
    const { result } = renderHook(() => useBillOperations(s));

    await act(async () => {
      await result.current.generateMonthlyBills("2026-08");
    });

    const generateCalls = callApi.mock.calls.filter(
      (c) => c[0] === "generateMonthBill",
    );
    // C1 (active sub) only — C2 has no subscription, C3's subscription is
    // paused, C4's customer is Inactive.
    expect(generateCalls).toHaveLength(1);
    expect(generateCalls[0][1]).toEqual({ customerId: "C1", month: "2026-08" });
  });

  it("generates nothing when no customer has an active subscription", async () => {
    callApi.mockResolvedValue({ bill: { id: "B1" } });
    const s = baseState({ subscriptions: [] });
    const { result } = renderHook(() => useBillOperations(s));

    await act(async () => {
      await result.current.generateMonthlyBills("2026-08");
    });

    expect(
      callApi.mock.calls.filter((c) => c[0] === "generateMonthBill"),
    ).toHaveLength(0);
  });

  it("treats a missing subscriptions array as no billable customers", async () => {
    callApi.mockResolvedValue({ bill: { id: "B1" } });
    const s = baseState({ subscriptions: undefined });
    const { result } = renderHook(() => useBillOperations(s));

    await act(async () => {
      await result.current.generateMonthlyBills("2026-08");
    });

    expect(
      callApi.mock.calls.filter((c) => c[0] === "generateMonthBill"),
    ).toHaveLength(0);
  });

  it("reports a partial failure count without throwing", async () => {
    callApi.mockImplementation(async (action) => {
      if (action === "generateMonthBill") throw new Error("rpc boom");
      return { bills: [] };
    });
    const s = baseState();
    const { result } = renderHook(() => useBillOperations(s));

    await act(async () => {
      await result.current.generateMonthlyBills("2026-08");
    });

    expect(s.toast$).toHaveBeenCalledWith(
      expect.stringContaining("1 failed"),
      "warning",
    );
  });

  it("refetches bills scoped to billMonth after generation", async () => {
    callApi.mockResolvedValue({ bills: [{ id: "B1" }] });
    const s = baseState();
    const { result } = renderHook(() => useBillOperations(s));

    await act(async () => {
      await result.current.generateMonthlyBills("2026-08");
    });

    expect(callApi).toHaveBeenCalledWith("getBills", { month: "2026-08" });
    expect(s.setBills).toHaveBeenCalledWith([{ id: "B1" }]);
  });
});
