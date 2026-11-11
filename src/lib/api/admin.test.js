import { describe, it, expect, vi, beforeEach } from "vitest";

// Per-test mutable DB state that the mocked `supabase` reads at call time.
const mockState = vi.hoisted(() => ({
  settings: undefined, // { schema_version, api_version }
  brands: [],
  subscriptions: [],
  settingsError: null,
}));

// Mock the shared module so we control the `supabase` singleton used by
// admin.js. `must` is the real no-op-on-null thrower.
vi.mock("./shared.js", () => {
  function chainable(table) {
    const calls = {
      select: [],
      eq: [],
      limit: [],
      maybeSingle: [],
      single: [],
    };
    const q = {};
    q.select = (cols, opts) => {
      calls.select.push({ cols, opts: opts || {} });
      return q;
    };
    q.eq = (col, val) => {
      calls.eq.push([col, val]);
      return q;
    };
    q.limit = (n) => {
      calls.limit.push(n);
      return q;
    };
    q.maybeSingle = () => {
      calls.maybeSingle.push(true);
      return q;
    };
    q.single = () => {
      calls.single.push(true);
      return q;
    };
    q._table = table;
    q._calls = calls;
    q.then = (resolve) => {
      resolve(route(table, calls));
      return q;
    };
    q.catch = () => q;
    return q;
  }

  function route(table, calls) {
    const sel = calls.select[0];
    const cols = sel ? sel.cols : null;
    const opts = sel ? sel.opts : {};
    const eqs = calls.eq;

    if (table === "settings") {
      // Connectivity probe: select("key").limit(1)
      if (cols === "key" && calls.limit.length) {
        if (mockState.settingsError)
          return { data: null, error: mockState.settingsError };
        return { data: [{ key: "x" }], error: null };
      }
      // settings.value lookup gated by key + maybeSingle
      if (cols === "value" && calls.maybeSingle.length) {
        const keyName = eqs[0][1];
        const row = mockState.settings && mockState.settings[keyName];
        return { data: row ? { value: row } : { value: null }, error: null };
      }
    }

    if (table === "milk_brands") {
      if (opts.count === "exact" && opts.head) {
        const statusPair = eqs.find((e) => e[0] === "status");
        const rows = statusPair
          ? mockState.brands.filter((b) => b.status === statusPair[1])
          : mockState.brands;
        return { data: null, count: rows.length, error: null };
      }
    }

    if (table === "subscriptions") {
      // distinct milk_type probe (subscription-centric model — customers no
      // longer carry a product column)
      return { data: mockState.subscriptions, error: null };
    }

    return { data: null, error: null };
  }

  return {
    supabase: { from: vi.fn((table) => chainable(table)) },
    must: (error) => {
      if (error) throw error;
    },
  };
});

import { MILK_TYPES } from "../constants.js";
import { runDiagnostics } from "./admin.js";

const EXP_MODE = import.meta.env.PROD ? "Production" : "Development";

describe("api/admin.js — runDiagnostics (live per-item probes, audit §3.9)", () => {
  beforeEach(() => {
    mockState.settings = undefined;
    mockState.brands = [{ status: "Active" }, { status: "Active" }];
    mockState.subscriptions = [
      { milk_type: "Full Cream" },
      { milk_type: "Toned" },
      { milk_type: "Full Cream" },
    ];
    mockState.settingsError = null;
  });

  it("returns structured { ok, mode, probes } and resolves each item live", async () => {
    const res = await runDiagnostics({});
    expect(res.ok).toBe(true);
    expect(res.error).toBeNull();
    expect(res.mode).toBe(EXP_MODE);

    // Schema/API version fall back to the documented constants when no row is
    // seeded (connectivity probe succeeded, so the values are verified-live).
    expect(res.probes["Schema version"]).toEqual({ ok: true, value: "V17" });
    expect(res.probes["API version"]).toEqual({ ok: true, value: "17" });
    expect(res.probes.Migration).toEqual({ ok: true, value: "Supabase CLI" });
    expect(res.probes.Mode).toEqual({ ok: true, value: EXP_MODE });

    // MilkTypes: config count + live in-use detail (2 distinct products used).
    expect(res.probes["MilkTypes seeded"]).toEqual({
      ok: true,
      value: `${MILK_TYPES.length} total`,
      detail: "2 in use",
    });

    // MilkBrands: live count of total + active.
    expect(res.probes["MilkBrands seeded"]).toEqual({
      ok: true,
      value: "2 active / 2 total",
    });
  });

  it("honours seeded schema_version / api_version settings when present", async () => {
    mockState.settings = { schema_version: "V18", api_version: "18" };
    const res = await runDiagnostics({});
    expect(res.probes["Schema version"]).toEqual({ ok: true, value: "V18" });
    expect(res.probes["API version"]).toEqual({ ok: true, value: "18" });
  });

  it("flags an unknown milk type referenced in subscriptions as not ok", async () => {
    mockState.subscriptions = [{ milk_type: "Mystery Milk" }];
    const res = await runDiagnostics({});
    expect(res.probes["MilkTypes seeded"].ok).toBe(false);
    expect(res.probes["MilkTypes seeded"].value).toBe(
      `${MILK_TYPES.length} total`,
    );
  });

  it("short-circuits probed items to skipped when DB is unreachable", async () => {
    mockState.settingsError = {
      message: "permission denied for table settings",
    };
    const res = await runDiagnostics({});
    expect(res.ok).toBe(false);
    expect(res.error).toBe("permission denied for table settings");
    // The four DB-probed items short-circuit to "offline".
    expect(res.probes["Schema version"]).toEqual({
      ok: false,
      value: "offline",
    });
    expect(res.probes["API version"]).toEqual({ ok: false, value: "offline" });
    expect(res.probes["MilkBrands seeded"]).toEqual({
      ok: false,
      value: "offline",
    });
    expect(res.probes["MilkTypes seeded"]).toEqual({
      ok: false,
      value: "offline",
    });
    // Migration is a tooling fact (ok gated on connectivity); Mode is the
    // client runtime and is independent of the DB.
    expect(res.probes.Migration).toEqual({
      ok: false,
      value: "Supabase CLI",
    });
    expect(res.probes.Mode).toEqual({ ok: true, value: EXP_MODE });
  });
});
