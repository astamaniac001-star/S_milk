import { describe, it, expect, vi, beforeEach } from "vitest";
import { callApi } from "../api.js";
import { supabase } from "../supabaseClient.js";
import { getToday } from "../utils.js";

// getDailyInventory powers the Imports page "By day" stock card (wired
// 2026-11-10). These tests pin its contract: Confirmed-only import counting
// (operator decision — Draft imports are not verified stock), the
// delivered-logs filter, and the remaining/shortage arithmetic. The action
// hits two tables in Promise.all, so each test stages per-table chains.
const makeChain = (payload = { data: [], error: null }) => {
  const c = {};
  for (const m of [
    "select",
    "eq",
    "order",
    "update",
    "insert",
    "delete",
    "limit",
    "is",
  ]) {
    c[m] = vi.fn(() => c);
  }
  c.single = vi.fn(async () => ({ data: null, error: null }));
  c.maybeSingle = vi.fn(async () => ({ data: null, error: null }));
  c.then = vi.fn((resolve) => {
    resolve(payload);
    return c;
  });
  return c;
};

vi.mock("../supabaseClient.js", () => ({
  supabase: {
    from: vi.fn(),
    rpc: vi.fn(),
    auth: { signInWithPassword: vi.fn(), updateUser: vi.fn() },
  },
}));

// Stage the two Promise.all queries in call order: milk_imports first,
// daily_logs second.
function stage(importsRows, logsRows) {
  const importsChain = makeChain({ data: importsRows, error: null });
  const logsChain = makeChain({ data: logsRows, error: null });
  supabase.from.mockImplementationOnce(() => importsChain);
  supabase.from.mockImplementationOnce(() => logsChain);
  return { importsChain, logsChain };
}

describe("getDailyInventory — Imports Day view stock card", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("filters imports to Confirmed and delivered logs only, then totals", async () => {
    // The third import row here would be a Draft in the real data — it can
    // only reach the reducer if the status filter is dropped, so the expected
    // totalImported of 50 pins the Confirmed-only rule.
    const { importsChain, logsChain } = stage(
      [{ quantity: 20 }, { quantity: 30 }],
      [
        { qty: 10, delivered: true },
        { qty: 5, delivered: false },
        { qty: 40, delivered: true },
      ],
    );
    const out = await callApi("getDailyInventory", { date: "2026-11-05" });

    expect(importsChain.eq).toHaveBeenCalledWith("date", "2026-11-05");
    expect(importsChain.eq).toHaveBeenCalledWith("status", "Confirmed");
    expect(logsChain.eq).toHaveBeenCalledWith("date", "2026-11-05");
    expect(out).toEqual({
      date: "2026-11-05",
      totalImported: 50,
      totalDelivered: 50,
      remaining: 0,
      shortage: 0,
    });
  });

  it("reports a shortage when delivered exceeds confirmed imports", async () => {
    stage([{ quantity: 20 }], [{ qty: 35, delivered: true }]);
    const out = await callApi("getDailyInventory", { date: "2026-11-05" });
    expect(out.remaining).toBe(0);
    expect(out.shortage).toBe(15);
  });

  it("defaults the date to IST today when none is passed", async () => {
    const { importsChain } = stage([], []);
    await callApi("getDailyInventory", {});
    expect(importsChain.eq).toHaveBeenCalledWith("date", getToday());
  });

  it("propagates a DB error from the imports query", async () => {
    supabase.from.mockImplementationOnce(() =>
      makeChain({ data: null, error: { message: "connection reset" } }),
    );
    // The logs query still runs in the same Promise.all — stage its success.
    supabase.from.mockImplementationOnce(() =>
      makeChain({ data: [], error: null }),
    );
    await expect(
      callApi("getDailyInventory", { date: "2026-11-05" }),
    ).rejects.toThrow("connection reset");
  });
});
