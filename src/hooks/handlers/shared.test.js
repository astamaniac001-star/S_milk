import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useHelpers } from "./shared";

// Audit 2026-11-09 (F5): handlers/shared.js (useHelpers) was at 14% coverage
// with executeApiAction flagged CRITICAL (fallow, 0% tested). renderHook
// drives the real hooks against a mocked callApi — same mock style as the
// sibling handler tests.
vi.mock("../../lib/api", () => ({
  callApi: vi.fn(),
}));

import { callApi } from "../../lib/api";

function harness(overrides = {}) {
  const state = {
    toast$: vi.fn(),
    closeModal: vi.fn(),
    form: {},
    ...overrides,
  };
  const rendered = renderHook(() => useHelpers(state));
  return { state, ...rendered };
}

describe("useHelpers.executeApiAction", () => {
  beforeEach(() => vi.clearAllMocks());

  it("mutates once, toasts once, closes the modal, then refetches + maps the list", async () => {
    callApi
      .mockResolvedValueOnce({ customerId: "C1" }) // the action
      .mockResolvedValueOnce({
        customers: [{ id: "C1", name: "Ramesh", version: 2 }],
      }); // the getList refetch
    const { state, result } = harness();
    const setList = vi.fn();

    let ok;
    await act(async () => {
      ok = await result.current.executeApiAction(
        "addCustomer",
        { name: "Ramesh" },
        "Customer added",
        "getCustomers",
        setList,
        (x) => ({ ...x, mapped: true }),
        "customers",
      );
    });

    expect(ok).toBe(true);
    // Exactly ONE mutation + ONE list refetch.
    expect(callApi).toHaveBeenCalledTimes(2);
    expect(callApi).toHaveBeenNthCalledWith(1, "addCustomer", {
      name: "Ramesh",
    });
    expect(callApi).toHaveBeenNthCalledWith(2, "getCustomers", {});
    // Exactly ONE success toast; modal closed.
    expect(state.toast$).toHaveBeenCalledTimes(1);
    expect(state.toast$).toHaveBeenCalledWith("Customer added", "success");
    expect(state.closeModal).toHaveBeenCalledTimes(1);
    // List set once with the mapped rows.
    expect(setList).toHaveBeenCalledTimes(1);
    expect(setList).toHaveBeenCalledWith([
      { id: "C1", name: "Ramesh", version: 2, mapped: true },
    ]);
  });

  it("toasts the error and returns false — no refetch, no closeModal", async () => {
    callApi.mockRejectedValueOnce(new Error("quantity must be > 0"));
    const { state, result } = harness();
    const setList = vi.fn();

    let ok;
    await act(async () => {
      ok = await result.current.executeApiAction(
        "saveSubscription",
        {},
        "Saved",
        "getSubscriptions",
        setList,
        (x) => x,
        "subscriptions",
      );
    });

    expect(ok).toBe(false);
    expect(callApi).toHaveBeenCalledTimes(1);
    expect(state.toast$).toHaveBeenCalledTimes(1);
    expect(state.toast$).toHaveBeenCalledWith("quantity must be > 0", "error");
    expect(state.closeModal).not.toHaveBeenCalled();
    expect(setList).not.toHaveBeenCalled();
  });
});

describe("useHelpers.handleIdAction", () => {
  beforeEach(() => vi.clearAllMocks());

  it("sends { [idKey]: id }, toasts success, refetches + maps", async () => {
    callApi
      .mockResolvedValueOnce({ deleted: true })
      .mockResolvedValueOnce({ customers: [{ id: "C1", name: "A" }] });
    const { result } = harness();
    const setList = vi.fn();

    await act(async () => {
      await result.current.handleIdAction(
        "deactivateCustomer",
        "id",
        "C1",
        "Customer deactivated",
        "getCustomers",
        setList,
        (x) => ({ ...x, mapped: true }),
        "customers",
      );
    });

    expect(callApi).toHaveBeenNthCalledWith(1, "deactivateCustomer", {
      id: "C1",
    });
    expect(setList).toHaveBeenCalledWith([
      { id: "C1", name: "A", mapped: true },
    ]);
  });

  it("uses the fallback message when the action rejects without one", async () => {
    callApi.mockRejectedValueOnce({ message: "" });
    const { state, result } = harness();

    await act(async () => {
      await result.current.handleIdAction(
        "deactivateCustomer",
        "id",
        "C1",
        "Customer deactivated",
        "getCustomers",
        vi.fn(),
        (x) => x,
        "customers",
        "Deactivate failed",
      );
    });

    expect(state.toast$).toHaveBeenCalledWith("Deactivate failed", "error");
  });
});

describe("useHelpers.saveWithValidation", () => {
  beforeEach(() => vi.clearAllMocks());

  it("aborts silently on an empty form", async () => {
    const { result } = harness();
    let ok;
    await act(async () => {
      ok = await result.current.saveWithValidation(
        {},
        () => null,
        {},
        "Customer",
      );
    });
    expect(ok).toBe(false);
    expect(callApi).not.toHaveBeenCalled();
  });

  it("toasts the validation error and never reaches a handler", async () => {
    const { state, result } = harness();
    const add = vi.fn();
    const update = vi.fn();
    let ok;
    await act(async () => {
      ok = await result.current.saveWithValidation(
        { name: "" },
        () => "Name is required",
        { addCustomer: add, updateCustomer: update },
        "Customer",
      );
    });
    expect(ok).toBe(false);
    expect(state.toast$).toHaveBeenCalledWith("Name is required", "error");
    expect(add).not.toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
  });

  it("routes to add<Entity> when form.id is absent and update<Entity> when present", async () => {
    const { result } = harness();
    const handlers = {
      addCustomer: vi.fn(async () => true),
      updateCustomer: vi.fn(async () => true),
    };

    await act(async () => {
      await result.current.saveWithValidation(
        { name: "New" },
        () => null,
        handlers,
        "Customer",
      );
      await result.current.saveWithValidation(
        { id: "C1", version: 2, name: "Edit" },
        () => null,
        handlers,
        "Customer",
      );
    });

    expect(handlers.addCustomer).toHaveBeenCalledTimes(1);
    expect(handlers.addCustomer).toHaveBeenCalledWith({ name: "New" });
    expect(handlers.updateCustomer).toHaveBeenCalledTimes(1);
    expect(handlers.updateCustomer).toHaveBeenCalledWith({
      id: "C1",
      version: 2,
      name: "Edit",
    });
  });

  it("falls back to state.form when no form argument is passed", async () => {
    const { result } = harness({ form: { name: "FromState" } });
    const add = vi.fn(async () => true);
    await act(async () => {
      await result.current.saveWithValidation(
        undefined,
        () => null,
        { addCustomer: add, updateCustomer: vi.fn() },
        "Customer",
      );
    });
    expect(add).toHaveBeenCalledWith({ name: "FromState" });
  });
});
