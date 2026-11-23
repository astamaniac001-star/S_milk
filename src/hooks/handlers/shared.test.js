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

// Chainable supabase mock for updateWithVersion:
// .from(t) → .update(patch) → .eq("id", …) → .eq("version", ev) → .select() → .single()
const { single, select, eq, update, from } = vi.hoisted(() => ({
  single: vi.fn(),
  select: vi.fn(),
  eq: vi.fn(),
  update: vi.fn(),
  from: vi.fn(),
}));

vi.mock("../../lib/supabaseClient.js", () => ({
  supabase: { from },
}));

// Wire the chain once at module scope (vi.hoisted guarantees the fns exist).
select.mockReturnValue({ single });
eq.mockReturnValue({ eq, select });
update.mockReturnValue({ eq });
from.mockReturnValue({ update });

import { callApi } from "../../lib/api";
// NOTE: updateWithVersion lives in src/lib/api/shared.js — NOT the handlers
// ./shared.js (useHelpers) this file primarily exercises.
import { updateWithVersion } from "../../lib/api/shared.js";

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

describe("useHelpers.executeApiAction — refresh-failure semantics (2026-11-21)", () => {
  beforeEach(() => vi.clearAllMocks());

  it("warns ONCE and reports success when the mutation lands but the refetch fails", async () => {
    callApi
      .mockResolvedValueOnce({ customerId: "C1" }) // mutation committed
      .mockRejectedValueOnce(new Error("fetch failed")); // refetch failed
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
        (x) => x,
        "customers",
      );
    });

    // The MUTATION succeeded — callers must not roll back UI state.
    expect(ok).toBe(true);
    expect(state.toast$).toHaveBeenCalledTimes(1);
    expect(state.toast$).toHaveBeenCalledWith(
      "Saved — but the list refresh failed. Use Retry to reload it.",
      "warning",
    );
    expect(setList).not.toHaveBeenCalled();
    // The modal still closes: the save itself succeeded.
    expect(state.closeModal).toHaveBeenCalledTimes(1);
  });
});

describe("updateWithVersion — OCC version handling (2026-11-21)", () => {
  beforeEach(() => vi.clearAllMocks());

  it("preserves a legitimate version = 0 compare-and-set", async () => {
    single.mockResolvedValueOnce({
      data: { id: "R1", version: 1 },
      error: null,
    });
    await act(async () => {
      await updateWithVersion("customers", "R1", 0, { status: "Inactive" });
    });
    expect(update).toHaveBeenCalledWith({
      status: "Inactive",
      version: 1, // ev (0) + 1
    });
    expect(eq).toHaveBeenNthCalledWith(2, "version", 0);
  });

  it("rejects a nullish version BEFORE touching Supabase", async () => {
    await act(async () => {
      await expect(
        updateWithVersion("bills", "B1", null, { locked: true }),
      ).rejects.toThrow("bills version is required for OCC");
      await expect(
        updateWithVersion("bills", "B1", undefined, { locked: true }),
      ).rejects.toThrow("bills version is required for OCC");
    });
    expect(from).not.toHaveBeenCalled();
  });

  it("throws typed CONFLICT when PGRST116 reports zero rows updated", async () => {
    single.mockResolvedValueOnce({
      data: null,
      error: { code: "PGRST116", message: "No rows" },
    });
    await act(async () => {
      await expect(
        updateWithVersion("bills", "B1", 3, { locked: true }),
      ).rejects.toMatchObject({ code: "CONFLICT" });
    });
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
