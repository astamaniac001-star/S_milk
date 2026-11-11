import { describe, it, expect, vi, beforeEach } from "vitest";
import { callApi } from "../api.js";
import { supabase } from "../supabaseClient.js";

// Audit 2026-11-09 (F5): adjustments.js was at 0% coverage — the money-
// adjacent apply* RPC paths (typed CONFLICT / ALREADY_APPLIED / LOCKED
// mapping) and the add* inserts had no tests. Mock pattern matches
// subscriptions.test.js: fresh chainable per from() call, thenable chain for
// bare awaits.
vi.mock("../supabaseClient.js", () => {
  // Shared chainable (same pattern as api.occ.test.js): from() returns THE
  // SAME object on every call; tests stage `.single` per path.
  const chainable = {
    select: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    insert: vi.fn().mockReturnThis(),
    delete: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    single: vi.fn(async () => ({ data: null, error: null })),
    maybeSingle: vi.fn(async () => ({ data: null, error: null })),
  };
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

describe("addAdjustment", () => {
  beforeEach(() => vi.clearAllMocks());

  it("inserts with coerced amount + applied=false and returns the id", async () => {
    chain().single.mockResolvedValue({
      data: { id: "A1" },
      error: null,
    });
    const out = await callApi("addAdjustment", {
      customerId: "C1",
      billId: "B1",
      amount: "50",
      reason: "Half delivery",
      date: "2026-11-09",
    });
    expect(chain().insert).toHaveBeenCalledWith([
      {
        customer_id: "C1",
        bill_id: "B1",
        amount: 50,
        reason: "Half delivery",
        applied: false,
        date: "2026-11-09",
      },
    ]);
    expect(out).toEqual({ adjustmentId: "A1" });
  });
});

describe("applyAdjustment (apply_adjustment_rpc)", () => {
  beforeEach(() => vi.clearAllMocks());

  it("requires adjustmentId, billId and version", async () => {
    await expect(callApi("applyAdjustment", {})).rejects.toThrow(
      "adjustmentId is required",
    );
    await expect(
      callApi("applyAdjustment", { adjustmentId: "A1" }),
    ).rejects.toThrow("billId is required");
    await expect(
      callApi("applyAdjustment", { adjustmentId: "A1", billId: "B1" }),
    ).rejects.toThrow("version is required for OCC");
  });

  it("sends the versioned payload to the RPC", async () => {
    supabase.rpc.mockResolvedValue({
      data: { success: true, new_amount: 100 },
      error: null,
    });
    const out = await callApi("applyAdjustment", {
      adjustmentId: "A1",
      billId: "B1",
      version: 2,
    });
    expect(supabase.rpc).toHaveBeenCalledWith("apply_adjustment_rpc", {
      p_adjustment_id: "A1",
      p_bill_id: "B1",
      p_version: 2,
    });
    expect(out).toEqual({ adjustmentId: "A1", billId: "B1" });
  });

  it.each([
    ["CONFLICT: Adjustment was modified by another process.", "CONFLICT"],
    ["Adjustment has already been applied.", "ALREADY_APPLIED"],
    ["Cannot apply adjustment to a locked bill.", "LOCKED"],
  ])("maps %s to code %s", async (rpcMessage, code) => {
    supabase.rpc.mockResolvedValue({
      data: null,
      error: { message: rpcMessage },
    });
    await expect(
      callApi("applyAdjustment", {
        adjustmentId: "A1",
        billId: "B1",
        version: 2,
      }),
    ).rejects.toMatchObject({ code });
  });
});

describe("applyCreditNote (apply_credit_note_rpc)", () => {
  beforeEach(() => vi.clearAllMocks());

  it("requires creditNoteId, billId and version", async () => {
    await expect(callApi("applyCreditNote", {})).rejects.toThrow(
      "creditNoteId is required",
    );
    await expect(
      callApi("applyCreditNote", { creditNoteId: "N1" }),
    ).rejects.toThrow("billId is required");
    await expect(
      callApi("applyCreditNote", { creditNoteId: "N1", billId: "B1" }),
    ).rejects.toThrow("version is required for OCC");
  });

  it("returns the RPC's newPaid + status for the caller's local patch", async () => {
    supabase.rpc.mockResolvedValue({
      data: { success: true, newPaid: 250, status: "Partial" },
      error: null,
    });
    const out = await callApi("applyCreditNote", {
      creditNoteId: "N1",
      billId: "B1",
      version: 3,
    });
    expect(supabase.rpc).toHaveBeenCalledWith("apply_credit_note_rpc", {
      p_credit_note_id: "N1",
      p_bill_id: "B1",
      p_version: 3,
    });
    expect(out).toEqual({
      creditNoteId: "N1",
      billId: "B1",
      newPaid: 250,
      status: "Partial",
    });
  });

  it.each([
    ["CONFLICT: Credit note was modified by another process.", "CONFLICT"],
    ["Credit note has already been applied.", "ALREADY_APPLIED"],
    ["Cannot apply a credit note to a locked bill.", "LOCKED"],
  ])("maps %s to code %s", async (rpcMessage, code) => {
    supabase.rpc.mockResolvedValue({
      data: null,
      error: { message: rpcMessage },
    });
    await expect(
      callApi("applyCreditNote", {
        creditNoteId: "N1",
        billId: "B1",
        version: 3,
      }),
    ).rejects.toMatchObject({ code });
  });
});
