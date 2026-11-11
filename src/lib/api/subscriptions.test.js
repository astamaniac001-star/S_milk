import { describe, it, expect, vi, beforeEach } from "vitest";
import { callApi } from "../api.js";
import { supabase } from "../supabaseClient.js";

// Audit 2026-11-09 (F5): subscriptions.js was at 19% coverage with the two
// OCC-critical paths (saveSubscription update, deleteSubscription) at 0%
// (fallow CRITICAL). These tests pin the API contracts with a mocked
// supabase-js client — same factory pattern as api.occ.test.js, but from()
// returns a FRESH chainable per call so each path can be staged precisely.
vi.mock("../supabaseClient.js", () => {
  // Shared chainable (same pattern as api.occ.test.js): from() returns THE
  // SAME object on every call, so tests stage `.single` / `.then` on the
  // instance they grab from the first from() call.
  const chainable = {
    select: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    insert: vi.fn().mockReturnThis(),
    delete: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    is: vi.fn().mockReturnThis(),
    single: vi.fn(async () => ({ data: null, error: null })),
    maybeSingle: vi.fn(async () => ({ data: null, error: null })),
  };
  // Bare awaits (`await supabase.from(t).delete(...).eq(...)`) resolve
  // through the chain's thenable; delete tests override `chainable.then`.
  chainable.then = vi.fn((resolve) => {
    resolve({ data: [], error: null });
    return chainable;
  });
  return {
    supabase: {
      from: vi.fn(() => chainable),
      rpc: vi.fn(),
      auth: { signInWithPassword: vi.fn(), updateUser: vi.fn() },
    },
  };
});

const chain = () => supabase.from();

describe("saveSubscription", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("requires customerId on add", async () => {
    await expect(
      callApi("saveSubscription", { milkType: "Full Cream", qty: 1 }),
    ).rejects.toThrow("customerId is required");
  });

  it("rejects qty <= 0 before touching the DB", async () => {
    await expect(
      callApi("saveSubscription", { customerId: "C1", qty: 0 }),
    ).rejects.toThrow("Quantity must be greater than 0");
    expect(supabase.from).not.toHaveBeenCalled();
  });

  it("inserts with JSON-stringified delivery_days and returns the id", async () => {
    chain().single.mockResolvedValue({
      data: { id: "S1", version: 1 },
      error: null,
    });
    const out = await callApi("saveSubscription", {
      customerId: "C1",
      brandId: "B1",
      milkType: "Toned",
      qty: 2,
      deliveryDays: [1, 3],
      isActive: true,
    });
    expect(chain().insert).toHaveBeenCalledWith([
      {
        customer_id: "C1",
        brand_id: "B1",
        milk_type: "Toned",
        qty: 2,
        delivery_days: JSON.stringify([1, 3]),
        is_active: true,
      },
    ]);
    expect(out).toEqual({ subscriptionId: "S1" });
  });

  it("update path passes expectedVersion + version bump via updateWithVersion", async () => {
    chain().single.mockResolvedValue({
      data: { id: "S1", version: 6 },
      error: null,
    });
    const out = await callApi("saveSubscription", {
      id: "S1",
      version: 5,
      customerId: "C1",
      brandId: null,
      milkType: "Full Cream",
      qty: 1.5,
      deliveryDays: [0, 6],
      isActive: false,
    });
    expect(chain().update).toHaveBeenCalledWith({
      brand_id: null,
      milk_type: "Full Cream",
      qty: 1.5,
      delivery_days: JSON.stringify([0, 6]),
      is_active: false,
      version: 6,
    });
    expect(chain().eq).toHaveBeenCalledWith("version", 5);
    expect(out).toEqual({ subscriptionId: "S1", newVersion: 6 });
  });

  it("maps the DB partial-unique 23505 to a friendly message", async () => {
    chain().single.mockResolvedValue({
      data: null,
      error: { code: "23505", message: "duplicate key value" },
    });
    await expect(
      callApi("saveSubscription", {
        customerId: "C1",
        brandId: "B1",
        milkType: "Full Cream",
        qty: 1,
        deliveryDays: [1],
      }),
    ).rejects.toThrow(
      "This customer already has an active subscription for this brand and milk type",
    );
  });
});

describe("deleteSubscription (OCC delete)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("requires the subscription id and version", async () => {
    await expect(callApi("deleteSubscription", { version: 1 })).rejects.toThrow(
      "subscriptionId is required",
    );
    await expect(
      callApi("deleteSubscription", { subscriptionId: "S1" }),
    ).rejects.toThrow("version is required for OCC");
  });

  it("deletes exactly one row when the version matches", async () => {
    chain().then = vi.fn((resolve) => {
      resolve({ count: 1, error: null });
      return chain();
    });
    const out = await callApi("deleteSubscription", {
      subscriptionId: "S1",
      version: 4,
    });
    expect(chain().delete).toHaveBeenCalledWith({ count: "exact" });
    expect(chain().eq).toHaveBeenCalledWith("version", 4);
    expect(out).toEqual({ subscriptionId: "S1", deleted: true });
  });

  it("throws CONFLICT when the count shows zero rows but the row still exists", async () => {
    chain().then = vi.fn((resolve) => {
      resolve({ count: 0, error: null });
      return chain();
    });
    await expect(
      callApi("deleteSubscription", { subscriptionId: "S1", version: 4 }),
    ).rejects.toMatchObject({ code: "CONFLICT" });
  });

  it("falls back to a verification select when count is unavailable", async () => {
    chain().then = vi.fn((resolve) => {
      resolve({ count: undefined, error: null });
      return chain();
    });
    // The verification select runs through the same shared chain.
    chain().maybeSingle.mockResolvedValue({
      data: { id: "S1" },
      error: null,
    });
    await expect(
      callApi("deleteSubscription", { subscriptionId: "S1", version: 4 }),
    ).rejects.toMatchObject({ code: "CONFLICT" });
  });

  it("reports success when the verification select finds the row gone", async () => {
    chain().then = vi.fn((resolve) => {
      resolve({ count: undefined, error: null });
      return chain();
    });
    chain().maybeSingle.mockResolvedValue({ data: null, error: null });
    const out = await callApi("deleteSubscription", {
      subscriptionId: "S1",
      version: 4,
    });
    expect(out).toEqual({ subscriptionId: "S1", deleted: true });
  });
});
