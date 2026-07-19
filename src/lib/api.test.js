import { describe, it, expect, vi, beforeEach } from "vitest";
import { callApi } from "./api.js";
import { supabase } from "./supabaseClient.js";

// Mock Supabase
// NOTE: The factory function is inlined directly into vi.fn() to avoid Vitest hoisting issues
// (ReferenceError: Cannot access 'createFromMock' before initialization).
vi.mock("./supabaseClient.js", () => ({
  supabase: {
    from: vi.fn(() => ({
      select: vi.fn().mockReturnThis(),
      update: vi.fn().mockReturnThis(),
      insert: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({
        data: {
          id: "1",
          amount: 100,
          amount_paid: 50,
          locked: false,
          version: 1,
        },
        error: null,
      }),
    })),
    rpc: vi.fn(),
  },
}));

describe("api.js - Money Paths", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("recordPayment", () => {
    it("should throw OVERPAY error if payment exceeds pending amount", async () => {
      // The default mock returns a bill with amount: 100, amount_paid: 50 (pending = 50).
      // Trying to pay 60 should trigger the OVERPAY error.
      await expect(
        callApi("recordPayment", { billId: "1", amount: 60 }),
      ).rejects.toThrow("exceeds pending");
    });

    it("should throw CONFLICT error if version mismatches (double-tab protection)", async () => {
      // 1. Mock the first call: supabase.from("bills").select().eq().single()
      const mockSelectChain = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({
          data: {
            id: "1",
            amount: 100,
            amount_paid: 50,
            locked: false,
            version: 1,
          },
          error: null,
        }),
      };

      // 2. Mock the second call: supabase.from("bills").update().eq().select().single()
      // We force it to return the PGRST116 error (0 rows updated due to version mismatch)
      const mockUpdateChain = {
        update: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        select: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({
          data: null,
          error: { code: "PGRST116", message: "0 rows updated" },
        }),
      };

      // Queue the mocks: first call gets selectChain, second gets updateChain
      supabase.from
        .mockReturnValueOnce(mockSelectChain)
        .mockReturnValueOnce(mockUpdateChain);

      await expect(
        callApi("recordPayment", { billId: "1", amount: 50, version: 1 }),
      ).rejects.toThrow("CONFLICT: This bill was modified by another tab");
    });
  });
});
