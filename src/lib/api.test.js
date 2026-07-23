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
      // Mock the RPC to return the exact error message the DB throws
      vi.mocked(supabase.rpc).mockResolvedValue({
        data: null,
        error: {
          message:
            "Payment exceeds pending amount (50.00). Use a credit note for advance payment.",
        },
      });

      await expect(
        callApi("recordPayment", {
          billId: "1",
          amount: 60,
          idempotencyKey: "test-key",
        }),
      ).rejects.toThrow("exceeds pending");
    });

    it("should throw CONFLICT error if version mismatches (double-tab protection)", async () => {
      // Mock the RPC to return a locked/conflict error
      vi.mocked(supabase.rpc).mockResolvedValue({
        data: null,
        error: {
          message:
            "CONFLICT: This bill was modified by another tab. Please refresh.",
        },
      });

      await expect(
        callApi("recordPayment", {
          billId: "1",
          amount: 50,
          idempotencyKey: "test-key-2",
        }),
      ).rejects.toThrow("CONFLICT");
    });
  });
});
