import { describe, it, expect, vi, beforeEach } from "vitest";
import { callApi } from "./api.js";
import { supabase } from "./supabaseClient.js";

// Mock Supabase. Same factory pattern as the existing api.test.js (inline factory
// to avoid Vitest hoisting issues with the supabaseClient mock).
vi.mock("./supabaseClient.js", () => {
  const chainable = {
    select: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    insert: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    delete: vi.fn().mockReturnThis(),
    single: vi.fn(),
    maybeSingle: vi.fn(),
  };
  chainable.order = vi.fn().mockReturnThis();
  return {
    supabase: {
      from: vi.fn(() => chainable),
      rpc: vi.fn(),
      auth: {
        signInWithPassword: vi.fn(),
        updateUser: vi.fn(),
      },
    },
  };
});

// Helper: make a chainable .single() result
const setSingle = (data, error) => {
  const chain = supabase.from();
  chain.single.mockResolvedValue({ data, error });
  return chain;
};

describe("api.js - Atomicity + OCC fixes (2026-07-24)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("rolloverMonth", () => {
    it("rejects missing targetMonth", async () => {
      await expect(callApi("rolloverMonth", {})).rejects.toThrow(
        "targetMonth is required",
      );
    });

    it("rejects malformed targetMonth (must be YYYY-MM)", async () => {
      await expect(
        callApi("rolloverMonth", { targetMonth: "2024-13" }),
      ).rejects.toThrow("YYYY-MM");
      await expect(
        callApi("rolloverMonth", { targetMonth: "2024-07-15" }),
      ).rejects.toThrow("YYYY-MM");
    });

    it("delegates to rollover_month_rpc and returns its payload", async () => {
      vi.mocked(supabase.rpc).mockResolvedValue({
        data: {
          billsGenerated: 4,
          skippedExisting: 2,
          activeSubscriptions: 6,
        },
        error: null,
      });
      const out = await callApi("rolloverMonth", { targetMonth: "2026-08" });
      expect(supabase.rpc).toHaveBeenCalledWith("rollover_month_rpc", {
        p_month: "2026-08",
      });
      expect(out).toEqual({
        billsGenerated: 4,
        skippedExisting: 2,
        activeSubscriptions: 6,
      });
    });

    it("wraps Unauthorized as AuthzError (code AUTHZ)", async () => {
      vi.mocked(supabase.rpc).mockResolvedValue({
        data: null,
        error: { message: "Unauthorized: only the operator may trigger rollover" },
      });
      await expect(
        callApi("rolloverMonth", { targetMonth: "2026-08" }),
      ).rejects.toMatchObject({ code: "AUTHZ" });
    });

    it("returns neutral counters when RPC returns null", async () => {
      vi.mocked(supabase.rpc).mockResolvedValue({ data: null, error: null });
      const out = await callApi("rolloverMonth", { targetMonth: "2026-09" });
      expect(out).toEqual({
        billsGenerated: 0,
        skippedExisting: 0,
        activeSubscriptions: 0,
      });
    });
  });

  describe("confirmMilkImport", () => {
    it("requires importId and version for OCC", async () => {
      await expect(callApi("confirmMilkImport", {})).rejects.toThrow("importId");
      await expect(
        callApi("confirmMilkImport", { importId: "x" }),
      ).rejects.toThrow("import version is required");
    });

    it("calls confirm_milk_import_rpc with the expected version", async () => {
      vi.mocked(supabase.rpc).mockResolvedValue({
        data: { status: "Confirmed", newVersion: 3, idempotent: false },
        error: null,
      });
      const out = await callApi("confirmMilkImport", {
        importId: "abc",
        version: 2,
      });
      expect(supabase.rpc).toHaveBeenCalledWith("confirm_milk_import_rpc", {
        p_import_id: "abc",
        p_expected_version: 2,
      });
      expect(out).toEqual({
        importId: "abc",
        status: "Confirmed",
        newVersion: 3,
        idempotent: false,
      });
    });

    it("maps CONFLICT to code=CONFLICT", async () => {
      vi.mocked(supabase.rpc).mockResolvedValue({
        data: null,
        error: { message: "CONFLICT: import was modified by another process" },
      });
      await expect(
        callApi("confirmMilkImport", { importId: "x", version: 1 }),
      ).rejects.toMatchObject({ code: "CONFLICT" });
    });

    it("maps NOT_FOUND to code=NOT_FOUND", async () => {
      vi.mocked(supabase.rpc).mockResolvedValue({
        data: null,
        error: { message: "NOT_FOUND: import does not exist" },
      });
      await expect(
        callApi("confirmMilkImport", { importId: "x", version: 1 }),
      ).rejects.toMatchObject({ code: "NOT_FOUND" });
    });
  });

  describe("deleteMilkImport", () => {
    it("requires importId and version for OCC", async () => {
      await expect(callApi("deleteMilkImport", {})).rejects.toThrow("importId");
      await expect(
        callApi("deleteMilkImport", { importId: "x" }),
      ).rejects.toThrow("import version is required");
    });

    it("calls delete_milk_import_rpc and returns deleted=true on success", async () => {
      vi.mocked(supabase.rpc).mockResolvedValue({ data: null, error: null });
      const out = await callApi("deleteMilkImport", {
        importId: "abc",
        version: 1,
      });
      expect(supabase.rpc).toHaveBeenCalledWith("delete_milk_import_rpc", {
        p_import_id: "abc",
        p_expected_version: 1,
      });
      expect(out).toEqual({ importId: "abc", deleted: true });
    });

    it("maps CONFLICT (stale version) — without this check the old code silently deleted nothing", async () => {
      vi.mocked(supabase.rpc).mockResolvedValue({
        data: null,
        error: { message: "CONFLICT: import was modified by another process" },
      });
      await expect(
        callApi("deleteMilkImport", { importId: "x", version: 1 }),
      ).rejects.toMatchObject({ code: "CONFLICT" });
    });

    it("maps NOT_FOUND (already deleted)", async () => {
      vi.mocked(supabase.rpc).mockResolvedValue({
        data: null,
        error: { message: "NOT_FOUND: import does not exist" },
      });
      await expect(
        callApi("deleteMilkImport", { importId: "x", version: 1 }),
      ).rejects.toMatchObject({ code: "NOT_FOUND" });
    });
  });

  describe("getBillText — customer fetch error no longer swallowed", () => {
    it("throws when the customer lookup errors (previously silently produced 'Hi there')", async () => {
      // bills.find().single() returns the bill; customer lookup returns an error
      setSingle(
        { id: "b", customer_id: "c", month: "2026-08", amount: 200, amount_paid: 50 },
        null,
      );
      const chain = supabase.from();
      chain.maybeSingle.mockResolvedValue({
        data: null,
        error: { message: "permission denied for table customers" },
      });
      await expect(callApi("getBillText", { billId: "b" })).rejects.toThrow(
        "permission denied",
      );
    });
  });

  describe("deactivateCustomer — now uses updateWithVersion", () => {
    it("requires id and version", async () => {
      await expect(callApi("deactivateCustomer", {})).rejects.toThrow("id is required");
      await expect(
        callApi("deactivateCustomer", { id: "c" }),
      ).rejects.toThrow("customer version is required");
    });

    it("sends version bump via the OCC helper and returns mapped customer", async () => {
      // OCC update path: .single() returns the post-update row
      setSingle(
        {
          id: "c",
          name: "Ram",
          delivery_address: "Street 1",
          phone: "9000000001",
          status: "Inactive",
          product: "Full Cream",
          daily_qty: 1,
          delivery_days: "[0,1,2]",
          balance: 0,
          version: 5,
        },
        null,
      );
      const out = await callApi("deactivateCustomer", { id: "c", version: 4 });
      expect(out).toMatchObject({
        id: "c",
        status: "Inactive",
        version: 5,
      });
      // The OCC helper chains .update(...).eq("id").eq("version").select().single()
      const chain = supabase.from();
      expect(chain.update).toHaveBeenCalled();
      expect(chain.select).toHaveBeenCalled();
      expect(chain.single).toHaveBeenCalled();
    });

    it("propagates CONFLICT when the row version has moved (PGRST116)", async () => {
      setSingle(null, { code: "PGRST116", message: "JSON object requested" });
      await expect(
        callApi("deactivateCustomer", { id: "c", version: 99 }),
      ).rejects.toMatchObject({ code: "CONFLICT" });
    });
  });

  describe("mapImportToApi — dead idempotencyKey removed", () => {
    it("does NOT generate an idempotencyKey on the add path", async () => {
      const { mapImportToApi } = await import("./api/mappers.js");
      const add = mapImportToApi({ brand: "Amul", type: "Toned", qty: 10, rate: 30, date: "2026-08-01" });
      expect(add).not.toHaveProperty("idempotencyKey");
    });
    it("threads id + expectedVersion on the edit path", async () => {
      const { mapImportToApi } = await import("./api/mappers.js");
      const edit = mapImportToApi({
        id: "imp-1",
        version: 3,
        brand: "Amul",
        type: "Toned",
        qty: 10,
        rate: 30,
        date: "2026-08-01",
      });
      expect(edit).toMatchObject({ id: "imp-1", expectedVersion: 3 });
      expect(edit).not.toHaveProperty("idempotencyKey");
    });
  });

  // ─── addAdHocLog — atomic RPC delegation (audit 2026-07-25, rule §14) ──────
  describe("addAdHocLog", () => {
    it("rejects missing customerId / date / non-positive qty before RPC", async () => {
      await expect(callApi("addAdHocLog", {})).rejects.toThrow(
        "customerId and date are required",
      );
      await expect(
        callApi("addAdHocLog", { customerId: "c", date: "2026-07-25" }),
      ).rejects.toThrow("qty must be > 0");
      await expect(
        callApi("addAdHocLog", {
          customerId: "c",
          date: "2026-07-25",
          qty: 0,
        }),
      ).rejects.toThrow("qty must be > 0");
    });

    it("delegates to record_ad_hoc_log_rpc with the normalized payload", async () => {
      vi.mocked(supabase.rpc).mockResolvedValue({
        data: { logId: "log-1", qty: 2.5, created: true },
        error: null,
      });
      const out = await callApi("addAdHocLog", {
        customerId: "c1",
        date: "2026-07-25",
        qty: 2.5,
        reason: "extra bottle",
        product: "Toned",
      });
      expect(supabase.rpc).toHaveBeenCalledWith("record_ad_hoc_log_rpc", {
        p_customer_id: "c1",
        p_date: "2026-07-25",
        p_qty: 2.5,
        p_product: "Toned",
        p_brand_id: null,
        p_reason: "extra bottle",
      });
      expect(out).toEqual({ logId: "log-1", qty: 2.5, created: true });
    });

    it("returns created=false when the RPC accumulated onto an existing row", async () => {
      vi.mocked(supabase.rpc).mockResolvedValue({
        data: { logId: "log-9", qty: 7, created: false },
        error: null,
      });
      const out = await callApi("addAdHocLog", {
        customerId: "c1",
        date: "2026-07-25",
        qty: 2,
      });
      // Default product is "" but the RPC substitutes "Full Cream" when blank.
      expect(supabase.rpc).toHaveBeenCalledWith(
        "record_ad_hoc_log_rpc",
        expect.objectContaining({ p_product: "" }),
      );
      expect(out).toEqual({ logId: "log-9", qty: 7, created: false });
    });

    it("maps Unauthorized → AuthzError (code AUTHZ)", async () => {
      vi.mocked(supabase.rpc).mockResolvedValue({
        data: null,
        error: { message: "Unauthorized: only the operator may record ad-hoc logs" },
      });
      await expect(
        callApi("addAdHocLog", {
          customerId: "c1",
          date: "2026-07-25",
          qty: 1,
        }),
      ).rejects.toMatchObject({ code: "AUTHZ" });
    });

    it("maps CONFLICT (concurrent insert race) to code=CONFLICT for client retry", async () => {
      vi.mocked(supabase.rpc).mockResolvedValue({
        data: null,
        error: { message: "CONFLICT: ad-hoc log race, please retry" },
      });
      await expect(
        callApi("addAdHocLog", {
          customerId: "c1",
          date: "2026-07-25",
          qty: 1,
        }),
      ).rejects.toMatchObject({ code: "CONFLICT" });
    });

    it("strips the BAD_REQUEST prefix before throwing", async () => {
      vi.mocked(supabase.rpc).mockResolvedValue({
        data: null,
        error: { message: "BAD_REQUEST: qty must be > 0" },
      });
      await expect(
        callApi("addAdHocLog", {
          customerId: "c1",
          date: "2026-07-25",
          qty: -1,
        }),
      ).rejects.toThrow("qty must be > 0");
    });
  });
});
