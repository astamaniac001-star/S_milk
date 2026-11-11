import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useSubscriptionHandlers } from "./useSubscriptionHandlers";

// Mock callApi so the handler tests are unit-level (no Supabase).
// mapSubscriptionToApi mimics the real mapper's contract: pass-through of the
// form plus id→expectedVersion for OCC (the mapper's exact shape is covered
// in api.test.js).
vi.mock("../../lib/api", () => ({
  callApi: vi.fn(),
  mapSubscriptionFromApi: vi.fn((x) => x),
  mapSubscriptionToApi: vi.fn((d) => ({
    ...d,
    ...(d.id ? { expectedVersion: d.version } : {}),
  })),
}));

import { callApi } from "../../lib/api";

function baseState(overrides = {}) {
  return {
    setSubscriptions: vi.fn(),
    closeModal: vi.fn(),
    toast$: vi.fn(),
    form: {},
    ...overrides,
  };
}

describe("useSubscriptionHandlers (advisor-all coverage)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ── saveSubscription ─────────────────────────────────────────────────

  // Valid minimal form — satisfies validateSubscriptionForm (customer +
  // brand + milk type + qty + days) so tests exercise the API path.
  const validForm = {
    customerId: "C1",
    brandId: "B1",
    milkType: "Full Cream",
    qty: 2,
    deliveryDays: [1, 2],
  };

  it("saveSubscription (new) calls saveSubscription API without expectedVersion", async () => {
    callApi
      .mockResolvedValueOnce({}) // saveSubscription
      .mockResolvedValueOnce({ subscriptions: [{ id: "s1" }] }); // getSubscriptions

    const s = baseState();
    const { result } = renderHook(() => useSubscriptionHandlers(s));

    await act(async () => {
      await result.current.saveSubscription({ ...validForm });
    });

    // First call: save (no expectedVersion because no id)
    expect(callApi).toHaveBeenCalledWith("saveSubscription", validForm);
    expect(s.toast$).toHaveBeenCalledWith("Subscription saved", "success");
    expect(s.closeModal).toHaveBeenCalled();
    expect(s.setSubscriptions).toHaveBeenCalledWith([{ id: "s1" }]);
  });

  it("saveSubscription blocks an invalid form (no brand) without calling the API", async () => {
    const s = baseState();
    const { result } = renderHook(() => useSubscriptionHandlers(s));

    await act(async () => {
      await result.current.saveSubscription({
        customerId: "C1",
        milkType: "Full Cream",
        qty: 2,
        deliveryDays: [1],
      });
    });

    expect(s.toast$).toHaveBeenCalledWith("Brand is required", "error");
    expect(callApi).not.toHaveBeenCalled();
  });

  it("saveSubscription (update) sends expectedVersion from data.version", async () => {
    callApi
      .mockResolvedValueOnce({}) // saveSubscription
      .mockResolvedValueOnce({ subscriptions: [] }); // getSubscriptions

    const s = baseState();
    const { result } = renderHook(() => useSubscriptionHandlers(s));

    await act(async () => {
      await result.current.saveSubscription({
        id: "sub-1",
        version: 3,
        ...validForm,
        qty: 1,
      });
    });

    expect(callApi).toHaveBeenCalledWith("saveSubscription", {
      id: "sub-1",
      version: 3,
      customerId: "C1",
      brandId: "B1",
      milkType: "Full Cream",
      qty: 1,
      deliveryDays: [1, 2],
      expectedVersion: 3,
    });
  });

  it("saveSubscription surfaces API error as error toast", async () => {
    callApi.mockRejectedValue(new Error("RPC failed"));
    const s = baseState();
    const { result } = renderHook(() => useSubscriptionHandlers(s));

    await act(async () => {
      await result.current.saveSubscription({ ...validForm, qty: 1 });
    });

    expect(s.toast$).toHaveBeenCalledWith("RPC failed", "error");
    expect(s.closeModal).not.toHaveBeenCalled();
  });

  it("saveSubscription uses fallback message when err.message is empty", async () => {
    callApi.mockRejectedValue(new Error(""));
    const s = baseState();
    const { result } = renderHook(() => useSubscriptionHandlers(s));

    await act(async () => {
      await result.current.saveSubscription({ ...validForm, qty: 1 });
    });

    expect(s.toast$).toHaveBeenCalledWith(
      "Failed to save subscription",
      "error",
    );
  });

  it("saveSubscription works when closeModal is undefined", async () => {
    callApi
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({ subscriptions: [] });

    const s = baseState({ closeModal: undefined });
    const { result } = renderHook(() => useSubscriptionHandlers(s));

    await act(async () => {
      await result.current.saveSubscription({ ...validForm, qty: 1 });
    });

    // Should succeed without throwing on missing closeModal
    expect(s.toast$).toHaveBeenCalledWith("Subscription saved", "success");
  });

  // ── fetchSubscriptionHistory ─────────────────────────────────────────

  it("fetchSubscriptionHistory returns history array on success", async () => {
    const history = [{ id: "h1" }, { id: "h2" }];
    callApi.mockResolvedValue({ history });

    const s = baseState();
    const { result } = renderHook(() => useSubscriptionHandlers(s));

    let res;
    await act(async () => {
      res = await result.current.fetchSubscriptionHistory("sub-1");
    });

    expect(callApi).toHaveBeenCalledWith("getSubscriptionHistory", {
      subscriptionId: "sub-1",
    });
    expect(res).toEqual(history);
  });

  it("fetchSubscriptionHistory returns [] when res.history is missing", async () => {
    callApi.mockResolvedValue({});

    const s = baseState();
    const { result } = renderHook(() => useSubscriptionHandlers(s));

    let res;
    await act(async () => {
      res = await result.current.fetchSubscriptionHistory("sub-1");
    });

    expect(res).toEqual([]);
  });

  it("fetchSubscriptionHistory returns [] and toasts error on failure", async () => {
    callApi.mockRejectedValue(new Error("network"));

    const s = baseState();
    const { result } = renderHook(() => useSubscriptionHandlers(s));

    let res;
    await act(async () => {
      res = await result.current.fetchSubscriptionHistory("sub-1");
    });

    expect(res).toEqual([]);
    expect(s.toast$).toHaveBeenCalledWith("network", "error");
  });

  it("fetchSubscriptionHistory uses fallback message when err.message is empty", async () => {
    callApi.mockRejectedValue(new Error(""));

    const s = baseState();
    const { result } = renderHook(() => useSubscriptionHandlers(s));

    await act(async () => {
      await result.current.fetchSubscriptionHistory("sub-1");
    });

    expect(s.toast$).toHaveBeenCalledWith("Failed to load history", "error");
  });

  // ── deleteSubscription ────────────────────────────────────────────────

  it("deleteSubscription calls API with id + version and refreshes list", async () => {
    callApi
      .mockResolvedValueOnce({}) // deleteSubscription
      .mockResolvedValueOnce({ subscriptions: [{ id: "s2" }] }); // getSubscriptions

    const s = baseState();
    const { result } = renderHook(() => useSubscriptionHandlers(s));

    await act(async () => {
      await result.current.deleteSubscription({ id: "sub-9", version: 4 });
    });

    expect(callApi).toHaveBeenCalledWith("deleteSubscription", {
      subscriptionId: "sub-9",
      version: 4,
    });
    expect(s.toast$).toHaveBeenCalledWith("Subscription deleted", "success");
    expect(s.setSubscriptions).toHaveBeenCalledWith([{ id: "s2" }]);
  });

  it("deleteSubscription refuses without an id", async () => {
    const s = baseState();
    const { result } = renderHook(() => useSubscriptionHandlers(s));

    await act(async () => {
      await result.current.deleteSubscription({ version: 1 });
    });

    expect(s.toast$).toHaveBeenCalledWith(
      "Subscription id is required",
      "error",
    );
    expect(callApi).not.toHaveBeenCalled();
  });

  it("deleteSubscription refuses without a version", async () => {
    const s = baseState();
    const { result } = renderHook(() => useSubscriptionHandlers(s));

    await act(async () => {
      await result.current.deleteSubscription({ id: "sub-9" });
    });

    expect(s.toast$).toHaveBeenCalledWith(
      "Subscription version is required",
      "error",
    );
    expect(callApi).not.toHaveBeenCalled();
  });

  it("deleteSubscription surfaces a concurrent-edit CONFLICT as an error toast and does not refresh", async () => {
    const conflict = new Error(
      "This subscription was changed elsewhere. Please refresh and try again.",
    );
    conflict.code = "CONFLICT";
    callApi.mockRejectedValueOnce(conflict);

    const s = baseState();
    const { result } = renderHook(() => useSubscriptionHandlers(s));

    await act(async () => {
      await result.current.deleteSubscription({ id: "sub-9", version: 2 });
    });

    expect(s.toast$).toHaveBeenCalledWith(
      "This subscription was changed elsewhere. Please refresh and try again.",
      "error",
    );
    expect(s.setSubscriptions).not.toHaveBeenCalled();
  });

  it("deleteSubscription uses fallback message when err.message is empty", async () => {
    callApi.mockRejectedValueOnce(new Error(""));

    const s = baseState();
    const { result } = renderHook(() => useSubscriptionHandlers(s));

    await act(async () => {
      await result.current.deleteSubscription({ id: "sub-9", version: 1 });
    });

    expect(s.toast$).toHaveBeenCalledWith(
      "Failed to delete subscription",
      "error",
    );
  });
});
