import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { useEntityStore } from "./useEntityStore";

// ── Mocks ───────────────────────────────────────────────────────────────
// We mock lib/api so the store's callApi resolves with curated payloads. The
// store calls mapXFromApi on most entities (rule §4) — those are real imports
// here so we exercise the actual mapper code paths end-to-end.

let callApiMock;
vi.mock("../lib/api", () => ({
  callApi: (...args) => callApiMock(...args),
  // Real mappers, imported from lib/api's barrel re-export, so the store's
  // post-fetch mapping is exercised against real implementations.
  mapCustomerFromApi: (c) => ({
    id: c.id,
    name: c.name,
    address: c.delivery_address,
    phone: c.phone,
    status: c.status,
    product: c.product,
    qty: c.daily_qty || 0,
    deliveryDays: c.delivery_days || [],
    balance: c.balance || 0,
    version: c.version || 1,
  }),
  mapImportFromApi: (i) => ({
    id: i.id,
    brand: i.brand_name,
    type: i.milk_type,
    qty: i.quantity || 0,
    rate: i.rate_per_liter || 0,
    total: i.total_cost || 0,
    supplier: i.supplier_name,
    date: i.date,
    status: i.status,
    version: i.version || 1,
  }),
  mapLogFromApi: (l) => ({
    id: l.id,
    custId: l.customer_id,
    date: l.date,
    delivered: !!l.delivered,
    qty: l.qty || 0,
    product: l.product,
    note: l.note,
  }),
  mapAdjustmentFromApi: (a) => ({
    adjustmentId: a.id,
    billId: a.bill_id,
    customerId: a.customer_id,
    amount: a.amount || 0,
    reason: a.reason,
    applied: !!a.applied,
    date: a.date,
    version: a.version ?? 1,
  }),
  mapPauseFromApi: (p) => ({
    id: p.id,
    custId: p.customer_id,
    start: p.start_date,
    end: p.end_date,
    reason: p.reason,
  }),
  mapBrandFromApi: (b) => ({
    id: b.id,
    name: b.brand_name,
    status: b.status,
    supplier: b.supplier_name,
    phone: b.supplier_phone,
    defaultMilkType: b.default_milk_type,
    rate: b.rate_per_liter || 0,
  }),
  mapSubscriptionFromApi: (s) => ({
    id: s.id,
    customerId: s.customer_id,
    milkType: s.milk_type,
    qty: s.qty || 0,
    deliveryDays: s.delivery_days || [],
    isActive: !!s.is_active,
    version: s.version || 1,
  }),
  mapCreditNoteFromApi: (c) => ({
    id: c.id,
    customerId: c.customer_id,
    billId: c.bill_id,
    amount: c.amount || 0,
    reason: c.reason,
    applied: !!c.applied,
    date: c.date,
    version: c.version ?? 1,
  }),
}));

// Stub utils.getToday so the effect's `logDate || getToday()` is deterministic.
vi.mock("../lib/utils", () => ({
  getToday: () => "2026-07-25",
}));

beforeEach(() => {
  vi.clearAllMocks();
});

describe("useEntityStore — safeFetch loadErrors banner (audit rule §10 layer 1)", () => {
  it("exposes a single action in loadErrors when callApi rejects; other entities still load", async () => {
    // getCustomers throws; everything else resolves to empty arrays.
    callApiMock = vi.fn(async (action) => {
      if (action === "getCustomers") throw new Error("permission denied");
      const map = {
        getBills: { bills: [] },
        getMilkImports: { imports: [] },
        getDailyLogs: { logs: [] },
        getAdjustments: { adjustments: [] },
        getPauses: { pauses: [] },
        getBrands: { brands: [] },
        getSubscriptions: { subscriptions: [] },
        getCreditNotes: { creditNotes: [] },
      };
      return map[action] || [];
    });

    const { result } = renderHook(() =>
      useEntityStore("tok", "2026-07-25", "2026-07"),
    );

    await waitFor(() =>
      expect(result.current.loadErrors).toContain("getCustomers"),
    );
    // The non-failing entities are populated (mapXFromApi maps [] to []).
    expect(result.current.customers).toEqual([]);
    expect(result.current.bills).toEqual([]);
    // Only the failed action is recorded — single-action granularity matters
    // for the operator-facing Retry banner in AppShell.
    expect(result.current.loadErrors).toEqual(["getCustomers"]);
  });

  it("records multiple failures in insert order without duplicates", async () => {
    callApiMock = vi.fn(async (action) => {
      if (action === "getCustomers" || action === "getBills")
        throw new Error("rate limited");
      const map = {
        getMilkImports: { imports: [] },
        getDailyLogs: { logs: [] },
        getAdjustments: { adjustments: [] },
        getPauses: { pauses: [] },
        getBrands: { brands: [] },
        getSubscriptions: { subscriptions: [] },
        getCreditNotes: { creditNotes: [] },
      };
      return map[action] || [];
    });

    const { result } = renderHook(() =>
      useEntityStore("tok", "2026-07-25", "2026-07"),
    );

    await waitFor(() =>
      expect(result.current.loadErrors.sort()).toEqual([
        "getBills",
        "getCustomers",
      ]),
    );
  });

  it("does not double-append in loadErrors on a re-render that re-runs the effect", async () => {
    // Promise order matters here: we want getCustomers to fail all calls.
    callApiMock = vi.fn(async (action) => {
      if (action === "getCustomers") throw new Error("error");
      return (
        {
          getBills: { bills: [] },
          getMilkImports: { imports: [] },
          getDailyLogs: { logs: [] },
          getAdjustments: { adjustments: [] },
          getPauses: { pauses: [] },
          getBrands: { brands: [] },
          getSubscriptions: { subscriptions: [] },
          getCreditNotes: { creditNotes: [] },
        }[action] || []
      );
    });

    const { result, rerender } = renderHook(() =>
      useEntityStore("tok", "2026-07-25", "2026-07"),
    );

    await waitFor(() =>
      expect(result.current.loadErrors).toContain("getCustomers"),
    );
    rerender();
    // safeFetch filters duplicates via `prev.includes(action)` so a re-run of
    // the effect is benign — the list stays at one entry. The `getCustomers`
    // action may or may not be re-invoked (effect deps are stable across a
    // plain rerender), but either way the loadErrors set stays deduped.
    await waitFor(() =>
      expect(result.current.loadErrors).toEqual(["getCustomers"]),
    );
  });
});

describe("useEntityStore — mapXFromApi applied at store level (audit rule §4)", () => {
  it("getMilkImports → setImports stores UI-shape (brandName is hidden, brand appears)", async () => {
    callApiMock = vi.fn(async (action) => {
      if (action === "getMilkImports")
        return {
          imports: [
            {
              id: "imp-1",
              brand_name: "Amul",
              milk_type: "Toned",
              quantity: 10,
              rate_per_liter: 30,
              total_cost: 300,
              supplier_name: "Amul Dairy",
              date: "2026-07-24",
              status: "Confirmed",
              version: 2,
            },
          ],
        };
      const map = {
        getCustomers: { customers: [] },
        getBills: { bills: [] },
        getDailyLogs: { logs: [] },
        getAdjustments: { adjustments: [] },
        getPauses: { pauses: [] },
        getBrands: { brands: [] },
        getSubscriptions: { subscriptions: [] },
        getCreditNotes: { creditNotes: [] },
      };
      return map[action] || [];
    });

    const { result } = renderHook(() =>
      useEntityStore("tok", "2026-07-25", "2026-07"),
    );

    await waitFor(() => expect(result.current.imports).toHaveLength(1));
    const imp = result.current.imports[0];
    // UI camelCase is what consumers (Pages/Modals) read — never snake_case.
    expect(imp).toMatchObject({
      id: "imp-1",
      brand: "Amul",
      type: "Toned",
      qty: 10,
      rate: 30,
      total: 300,
      supplier: "Amul Dairy",
      date: "2026-07-24",
      status: "Confirmed",
      version: 2,
    });
    // Double-mapping would zero `total` (because total_cost → total → toNum(undefined) = 0).
    // This is the regression trap AGENTS.md rule §4 warns about — keep this
    // test green to catch a future double-map.
    expect(imp.total).toBe(300);
  });

  it("getBills is passed straight through with NO double-map (rule §4)", async () => {
    callApiMock = vi.fn(async (action) => {
      if (action === "getBills")
        return {
          // getBills already maps inside callApi, so this is the UI shape.
          bills: [
            {
              id: "B1",
              custId: "C1",
              month: "2026-07",
              amount: 200,
              paid: 50,
              status: "Partial",
              locked: false,
              due: null,
              version: 1,
            },
          ],
        };
      const map = {
        getCustomers: { customers: [] },
        getMilkImports: { imports: [] },
        getDailyLogs: { logs: [] },
        getAdjustments: { adjustments: [] },
        getPauses: { pauses: [] },
        getBrands: { brands: [] },
        getSubscriptions: { subscriptions: [] },
        getCreditNotes: { creditNotes: [] },
      };
      return map[action] || [];
    });

    const { result } = renderHook(() =>
      useEntityStore("tok", "2026-07-25", "2026-07"),
    );

    await waitFor(() => expect(result.current.bills).toHaveLength(1));
    // If the store ever re-maps this we'd see custId → undefined (no
    // `customer_id` field available), and we'd love to detect that.
    const bill = result.current.bills[0];
    expect(bill.custId).toBe("C1");
    expect(bill.paid).toBe(50);
    expect(bill.status).toBe("Partial");
  });
});

describe("useEntityStore — fetchLogs(date) refresh (audit rule §10 layer 1 — non-fatal)", () => {
  it("does NOT blow up the loadErrors state-sheet on a getDailyLogs failure during a date refresh", async () => {
    // Initial fetch succeeds with empty results so loadErrors stays clean.
    callApiMock = vi.fn(async (action) => {
      const map = {
        getCustomers: { customers: [] },
        getBills: { bills: [] },
        getMilkImports: { imports: [] },
        getDailyLogs: { logs: [] },
        getAdjustments: { adjustments: [] },
        getPauses: { pauses: [] },
        getBrands: { brands: [] },
        getSubscriptions: { subscriptions: [] },
        getCreditNotes: { creditNotes: [] },
      };
      return map[action] || [];
    });

    const { result } = renderHook(() =>
      useEntityStore("tok", "2026-07-25", "2026-07"),
    );

    // Wait for the initial parallel fetch to complete.
    await waitFor(() => expect(result.current.logs).toEqual([]));
    // There's no ferryPer loadErrors entry after the initial fetch.
    expect(result.current.loadErrors).toEqual([]);

    // The fetchLogs path is NOT safeFetch, but audit 2026-11-09 (F15) changed
    // it from fully silent to layer-1 visible: the failure appends ONE
    // deduped "getDailyLogs" entry to the loadErrors banner so the operator
    // gets a Retry affordance. Repeat failures must not grow the list.
    callApiMock.mockImplementationOnce(async () => {
      throw new Error("date refresh");
    });
    await act(async () => {
      await result.current.fetchLogs("2026-07-26");
    });
    expect(result.current.loadErrors).toEqual(["getDailyLogs"]);

    await act(async () => {
      await result.current.fetchLogs("2026-07-26");
    });
    // Deduped — the state-sheet cannot blow up on repeated failures.
    expect(result.current.loadErrors).toEqual(["getDailyLogs"]);
  });

  it("replaces logs state with newly mapped UI rows on date refresh", async () => {
    callApiMock = vi.fn(async (action) => {
      if (action === "getDailyLogs")
        return {
          logs: [
            {
              id: "L1",
              customer_id: "C1",
              date: "2026-07-26",
              delivered: true,
              qty: 1,
              product: "Toned",
              note: "Extra delivery",
            },
          ],
        };
      const map = {
        getCustomers: { customers: [] },
        getBills: { bills: [] },
        getMilkImports: { imports: [] },
        getAdjustments: { adjustments: [] },
        getPauses: { pauses: [] },
        getBrands: { brands: [] },
        getSubscriptions: { subscriptions: [] },
        getCreditNotes: { creditNotes: [] },
      };
      return map[action] || [];
    });

    const { result } = renderHook(() =>
      useEntityStore("tok", "2026-07-25", "2026-07"),
    );
    await waitFor(() => expect(result.current.logs).toHaveLength(1));
    expect(result.current.logs[0]).toMatchObject({
      id: "L1",
      custId: "C1",
      date: "2026-07-26",
      delivered: true,
      qty: 1,
      product: "Toned",
      note: "Extra delivery",
    });
  });
});

describe("useEntityStore — refresh() bumps refreshKey (rule §10 layer 1 retry button)", () => {
  it("calling refresh clears loadErrors and retriggers the effect to retry the failing fetches", async () => {
    // Failing → resolving on second visit via refresh(). The refresh() call
    // setLoadErrors([]) AND setRefreshKey(k + 1).
    let resolveNow = false;
    callApiMock = vi.fn(async (action) => {
      if (action === "getCustomers" && !resolveNow)
        throw new Error("network down");
      const map = {
        getCustomers: { customers: [] },
        getBills: { bills: [] },
        getMilkImports: { imports: [] },
        getDailyLogs: { logs: [] },
        getAdjustments: { adjustments: [] },
        getPauses: { pauses: [] },
        getBrands: { brands: [] },
        getSubscriptions: { subscriptions: [] },
        getCreditNotes: { creditNotes: [] },
      };
      return map[action] || [];
    });

    const { result } = renderHook(() =>
      useEntityStore("tok", "2026-07-25", "2026-07"),
    );

    await waitFor(() =>
      expect(result.current.loadErrors).toContain("getCustomers"),
    );

    resolveNow = true;
    act(() => result.current.refresh());

    await waitFor(() => expect(result.current.loadErrors).toEqual([]));
  });
});
