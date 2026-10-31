import { describe, it, expect, vi, beforeEach } from "vitest";
import { callApi } from "./api.js";
import { mapCreditNoteFromApi, mapPaymentToApi } from "./api/mappers.js";
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

  describe("recordPayment idempotency contract (AGENTS §14)", () => {
    // Regression: mapping must honor a caller-supplied idempotency key so a
    // network blip can be retried without minting a fresh UUID (which would
    // defeat the `record_payment_rpc` uniqueness guard and double-charge).
    it("reuses the caller-supplied idempotencyKey instead of minting a new one", () => {
      const payload = mapPaymentToApi("bill-1", 100, {
        idempotencyKey: "stable-key-for-retry",
      });
      expect(payload.idempotencyKey).toBe("stable-key-for-retry");
    });

    it("mints a new key only when the caller omits one", () => {
      const a = mapPaymentToApi("bill-1", 50);
      const b = mapPaymentToApi("bill-1", 50);
      expect(a.idempotencyKey).toBeTruthy();
      expect(b.idempotencyKey).toBeTruthy();
      expect(a.idempotencyKey).not.toBe(b.idempotencyKey);
    });
  });

  describe("mapCreditNoteFromApi shape (AGENTS §4)", () => {
    // Regression: applied_to_bill_id (written by apply_credit_note_rpc) must
    // survive the DB→UI mapping so an applied note stays traceable to the
    // bill it reduced — it is a DIFFERENT column from bill_id.
    it("maps appliedToBillId separately from billId", () => {
      const ui = mapCreditNoteFromApi({
        id: "cn-1",
        customer_id: "c-1",
        bill_id: "bill-issued-against",
        applied_to_bill_id: "bill-actually-reduced",
        amount: 50,
        reason: "Spoiled milk",
        applied: true,
        date: "2026-10-31",
        version: 3,
      });
      expect(ui.billId).toBe("bill-issued-against");
      expect(ui.appliedToBillId).toBe("bill-actually-reduced");
      expect(ui.applied).toBe(true);
      expect(ui.version).toBe(3);
    });
  });
});
