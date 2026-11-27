import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  generateDailyLogsForDate,
  bulkUpsertLogs,
  buildDailyLogRows,
} from "./delivery.js";
import { supabase, __mock } from "../supabaseClient.js";

// Mock Supabase with a thenable chain so `await supabase.from(t).select(...)`
// resolves with per-table data, and `.upsert()` records its arguments.
vi.mock("../supabaseClient.js", () => {
  const state = {
    data: {},
    upsertCalls: [],
    updateCalls: [],
    insertCalls: [],
    selectCalls: [],
  };
  const chain = (table) => {
    const c = {
      table,
      select: vi.fn((cols) => {
        state.selectCalls.push({ table, cols });
        return c;
      }),
      eq: vi.fn(() => c),
      is: vi.fn(() => c),
      limit: vi.fn(() => c),
      update: vi.fn((patch) => {
        state.updateCalls.push({ table, patch });
        return c;
      }),
      insert: vi.fn((rows) => {
        state.insertCalls.push({ table, rows });
        return c;
      }),
      upsert: vi.fn(async (rows, opts) => {
        state.upsertCalls.push({ table, rows, opts });
        return { count: rows.length, error: null };
      }),
      then: (resolve, reject) =>
        Promise.resolve({ data: state.data[table] || [], error: null }).then(
          resolve,
          reject,
        ),
    };
    return c;
  };
  return {
    supabase: {
      from: vi.fn((t) => chain(t)),
      rpc: vi.fn(),
    },
    __mock: state,
  };
});

const ALL_DAYS = [0, 1, 2, 3, 4, 5, 6];

function seed({ customers = [], subscriptions = [], pauses = [], logs = [] }) {
  __mock.data = {
    customers,
    subscriptions,
    pause_periods: pauses,
    daily_logs: logs,
  };
  __mock.upsertCalls = [];
  __mock.updateCalls = [];
  __mock.insertCalls = [];
  __mock.selectCalls = [];
}

function lastUpsert() {
  return __mock.upsertCalls[__mock.upsertCalls.length - 1];
}

describe("generateDailyLogsForDate â€” subscription-centric generation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    seed({});
  });

  it("creates one log row per matching subscription product (multi-sub customer)", async () => {
    seed({
      customers: [{ id: "C1", status: "Active" }],
      subscriptions: [
        {
          customer_id: "C1",
          delivery_days: ALL_DAYS,
          qty: 1,
          milk_type: "Full Cream",
        },
        {
          customer_id: "C1",
          delivery_days: ALL_DAYS,
          qty: 2,
          milk_type: "Toned",
        },
      ],
    });

    const res = await generateDailyLogsForDate({ date: "2026-08-03" });

    expect(res.created).toBe(2);
    // Brandless subs take the find-then-INSERT path (2026-11-21 fix): NULL
    // never matches a PostgREST onConflict target, so brandless rows must
    // NOT go through the branded upsert. (The generator inserts one row per
    // brandless entry.)
    expect(__mock.upsertCalls).toHaveLength(0);
    const rows = __mock.insertCalls.flatMap((c) => c.rows);
    expect(rows).toHaveLength(2);
    expect(rows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          customer_id: "C1",
          date: "2026-08-03",
          product: "Full Cream",
          qty: 1,
          delivered: false,
        }),
        expect.objectContaining({
          customer_id: "C1",
          product: "Toned",
          qty: 2,
        }),
      ]),
    );
  });

  it("branded generation uses onConflict customer_id,date,brand_id,product as the DB row identity", async () => {
    seed({
      customers: [{ id: "C1", status: "Active" }],
      subscriptions: [
        {
          customer_id: "C1",
          delivery_days: ALL_DAYS,
          qty: 1,
          milk_type: "Toned",
          brand_id: "B1",
        },
      ],
    });

    await generateDailyLogsForDate({ date: "2026-08-03" });

    expect(lastUpsert().opts.onConflict).toBe(
      "customer_id,date,brand_id,product",
    );
  });

  it("carries the subscription's brand_id onto the generated log row", async () => {
    seed({
      customers: [{ id: "C1", status: "Active" }],
      subscriptions: [
        {
          customer_id: "C1",
          delivery_days: ALL_DAYS,
          qty: 1,
          milk_type: "Full Cream",
          brand_id: "B1",
        },
      ],
    });

    const res = await generateDailyLogsForDate({ date: "2026-08-03" });

    expect(res.created).toBe(1);
    expect(lastUpsert().rows[0]).toMatchObject({
      product: "Full Cream",
      brand_id: "B1",
    });
  });

  it("writes brandless (legacy) subscriptions via the INSERT path with brand_id null (2026-11-21 fix)", async () => {
    seed({
      customers: [{ id: "C1", status: "Active" }],
      subscriptions: [
        {
          customer_id: "C1",
          delivery_days: ALL_DAYS,
          qty: 1,
          milk_type: "Full Cream",
          brand_id: null,
        },
      ],
    });

    await generateDailyLogsForDate({ date: "2026-08-03" });

    // Brandless rows bypass the upsert entirely (NULL never matches a
    // unique index) — they are find-then-update-or-inserted.
    expect(__mock.upsertCalls).toHaveLength(0);
    expect(__mock.insertCalls).toHaveLength(1);
    expect(__mock.insertCalls[0].rows[0].brand_id).toBeNull();
  });

  it("creates separate rows for the same milk type from different brands", async () => {
    seed({
      customers: [{ id: "C1", status: "Active" }],
      subscriptions: [
        {
          customer_id: "C1",
          delivery_days: ALL_DAYS,
          qty: 1,
          milk_type: "Full Cream",
          brand_id: "B1",
        },
        {
          customer_id: "C1",
          delivery_days: ALL_DAYS,
          qty: 2,
          milk_type: "Full Cream",
          brand_id: "B2",
        },
      ],
    });

    const res = await generateDailyLogsForDate({ date: "2026-08-03" });

    expect(res.created).toBe(2);
    const rows = lastUpsert().rows;
    expect(rows).toHaveLength(2);
    expect(rows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          product: "Full Cream",
          brand_id: "B1",
          qty: 1,
        }),
        expect.objectContaining({
          product: "Full Cream",
          brand_id: "B2",
          qty: 2,
        }),
      ]),
    );
  });

  it("merges same-product subscriptions into one row with the summed qty", async () => {
    seed({
      customers: [{ id: "C1", status: "Active" }],
      subscriptions: [
        {
          customer_id: "C1",
          delivery_days: ALL_DAYS,
          qty: 1,
          milk_type: "Full Cream",
        },
        {
          customer_id: "C1",
          delivery_days: ALL_DAYS,
          qty: 2.5,
          milk_type: "Full Cream",
        },
      ],
    });

    const res = await generateDailyLogsForDate({ date: "2026-08-03" });

    expect(res.created).toBe(1);
    // Brandless merge → single row through the INSERT path.
    expect(__mock.upsertCalls).toHaveLength(0);
    expect(__mock.insertCalls).toHaveLength(1);
    expect(__mock.insertCalls[0].rows).toHaveLength(1);
    expect(__mock.insertCalls[0].rows[0]).toMatchObject({
      product: "Full Cream",
      qty: 3.5,
    });
  });

  it("ignores customers that have no active subscription (no customer-default fallback)", async () => {
    seed({
      customers: [{ id: "C1", status: "Active" }],
      subscriptions: [],
    });

    const res = await generateDailyLogsForDate({ date: "2026-08-03" });

    expect(res.created).toBe(0);
    expect(__mock.upsertCalls).toHaveLength(0);
  });

  it("skips inactive customers", async () => {
    seed({
      customers: [{ id: "C1", status: "Inactive" }],
      subscriptions: [
        {
          customer_id: "C1",
          delivery_days: ALL_DAYS,
          qty: 1,
          milk_type: "Full Cream",
        },
      ],
    });

    const res = await generateDailyLogsForDate({ date: "2026-08-03" });

    expect(res.created).toBe(0);
    expect(res.skippedInactiveCust).toBe(1);
  });

  it("skips paused customers", async () => {
    seed({
      customers: [{ id: "C1", status: "Active" }],
      subscriptions: [
        {
          customer_id: "C1",
          delivery_days: ALL_DAYS,
          qty: 1,
          milk_type: "Full Cream",
        },
      ],
      pauses: [{ customer_id: "C1", start_date: "2026-08-01", end_date: null }],
    });

    const res = await generateDailyLogsForDate({ date: "2026-08-03" });

    expect(res.created).toBe(0);
    expect(res.skippedPaused).toBe(1);
  });

  it("skips subscriptions whose delivery days do not include the date's weekday", async () => {
    seed({
      customers: [{ id: "C1", status: "Active" }],
      subscriptions: [
        {
          customer_id: "C1",
          delivery_days: [],
          qty: 1,
          milk_type: "Full Cream",
        },
      ],
    });

    const res = await generateDailyLogsForDate({ date: "2026-08-03" });

    expect(res.created).toBe(0);
    expect(res.skippedWrongDay).toBe(1);
  });

  it("does not re-create a product row that already exists for the date", async () => {
    seed({
      customers: [{ id: "C1", status: "Active" }],
      subscriptions: [
        {
          customer_id: "C1",
          delivery_days: ALL_DAYS,
          qty: 1,
          milk_type: "Full Cream",
        },
        {
          customer_id: "C1",
          delivery_days: ALL_DAYS,
          qty: 2,
          milk_type: "Toned",
        },
      ],
      logs: [{ customer_id: "C1", product: "Full Cream" }],
    });

    const res = await generateDailyLogsForDate({ date: "2026-08-03" });

    expect(res.created).toBe(1);
    expect(res.skippedExisting).toBe(1);
    // Brandless toInsert row (Toned) is find-then-modified, never upserted.
    // NOTE: the mock's `then` resolves without applying query filters, so the
    // find matches the seeded Full Cream row — the assertion's point is that
    // NO duplicate row is created (no upsert, no second INSERT), the existing
    // row is updated in place.
    expect(__mock.upsertCalls).toHaveLength(0);
    expect(__mock.insertCalls).toHaveLength(0);
    expect(__mock.updateCalls).toHaveLength(1);
    expect(__mock.updateCalls[0].table).toBe("daily_logs");
  });

  it("requires a date", async () => {
    await expect(generateDailyLogsForDate({})).rejects.toThrow(
      "date is required",
    );
  });
});

describe("bulkUpsertLogs â€” row identity", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    seed({});
  });

  it("uses onConflict customer_id,date,brand_id,product", async () => {
    await bulkUpsertLogs({
      logs: [
        {
          custId: "C1",
          date: "2026-08-03",
          product: "Toned",
          qty: 1,
          brandId: "B1",
        },
      ],
    });

    expect(lastUpsert().opts.onConflict).toBe(
      "customer_id,date,brand_id,product",
    );
  });

  it("forwards brandId and accepts both camelCase forms", async () => {
    await bulkUpsertLogs({
      logs: [
        {
          custId: "C1",
          date: "2026-08-03",
          product: "Toned",
          qty: 1,
          brandId: "B1",
        },
        {
          custId: "C1",
          date: "2026-08-03",
          product: "Toned",
          qty: 1,
          brand_id: "B2",
        },
        { custId: "C1", date: "2026-08-03", product: "Toned", qty: 1 },
      ],
    });

    const rows = lastUpsert().rows;
    expect(rows).toHaveLength(2);
    expect(rows[0].brand_id).toBe("B1");
    expect(rows[1].brand_id).toBe("B2");
    // The brandless row never reaches the upsert â€” NULL cannot match a
    // unique index, so it must not be sent through onConflict.
    expect(rows.some((r) => r.brand_id === null)).toBe(false);
  });

  it("updates the existing brandless row instead of inserting a duplicate", async () => {
    seed({
      logs: [
        { id: "L1", customer_id: "C1", date: "2026-08-03", product: "Toned" },
      ],
    });

    const res = await bulkUpsertLogs({
      logs: [
        {
          custId: "C1",
          date: "2026-08-03",
          product: "Toned",
          qty: 2,
          delivered: true,
        },
      ],
    });

    expect(res.saved).toBe(1);
    expect(__mock.upsertCalls).toHaveLength(0);
    expect(__mock.updateCalls).toHaveLength(1);
    expect(__mock.updateCalls[0].patch).toMatchObject({
      qty: 2,
      delivered: true,
    });
    expect(__mock.insertCalls).toHaveLength(0);
  });

  it("inserts a brandless row when no brandless row exists yet", async () => {
    seed({ logs: [] });

    const res = await bulkUpsertLogs({
      logs: [{ custId: "C1", date: "2026-08-03", product: "Toned", qty: 1 }],
    });

    expect(res.saved).toBe(1);
    expect(__mock.upsertCalls).toHaveLength(0);
    expect(__mock.insertCalls).toHaveLength(1);
    expect(__mock.insertCalls[0].rows[0]).toMatchObject({
      customer_id: "C1",
      product: "Toned",
      brand_id: null,
    });
  });

  it("returns saved=0 for an empty batch without touching the DB", async () => {
    const res = await bulkUpsertLogs({ logs: [] });
    expect(res).toEqual({ saved: 0 });
    expect(supabase.from).not.toHaveBeenCalled();
  });
});

// The pure scheduling step, extracted from generateDailyLogsForDate so the
// rules are testable without Supabase mocks. Every Monday = dow 1.
const DOW_MON = 1;

describe("buildDailyLogRows — pure scheduling rules", () => {
  const baseArgs = {
    date: "2026-08-03",
    dow: DOW_MON,
    subscriptions: [],
    activeCustomerIds: new Set(),
    pausedCustomerIds: new Set(),
    existingKeys: new Set(),
  };

  it("merges same-brand same-type subscriptions into one summed row", () => {
    const { rows, counters } = buildDailyLogRows({
      ...baseArgs,
      subscriptions: [
        {
          customer_id: "C1",
          delivery_days: [1, 2],
          qty: 1,
          milk_type: "Full Cream",
          brand_id: "B1",
        },
        {
          customer_id: "C1",
          delivery_days: [1, 2],
          qty: 2.5,
          milk_type: "Full Cream",
          brand_id: "B1",
        },
      ],
      activeCustomerIds: new Set(["C1"]),
    });

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      customer_id: "C1",
      date: "2026-08-03",
      product: "Full Cream",
      brand_id: "B1",
      qty: 3.5,
      delivered: false,
      note: "Auto-generated (Sub)",
    });
    expect(counters).toEqual({
      skippedExisting: 0,
      skippedPaused: 0,
      skippedWrongDay: 0,
      skippedInactiveCust: 0,
    });
  });

  it("keeps the same milk type from different brands as separate rows", () => {
    const { rows } = buildDailyLogRows({
      ...baseArgs,
      subscriptions: [
        {
          customer_id: "C1",
          delivery_days: [1],
          qty: 1,
          milk_type: "Full Cream",
          brand_id: "B1",
        },
        {
          customer_id: "C1",
          delivery_days: [1],
          qty: 2,
          milk_type: "Full Cream",
          brand_id: "B2",
        },
      ],
      activeCustomerIds: new Set(["C1"]),
    });

    expect(rows.map((r) => [r.brand_id, r.qty])).toEqual([
      ["B1", 1],
      ["B2", 2],
    ]);
  });

  it("emits brand_id null for legacy unbranded substitutions", () => {
    const { rows } = buildDailyLogRows({
      ...baseArgs,
      subscriptions: [
        {
          customer_id: "C1",
          delivery_days: [1],
          qty: 2,
          milk_type: "Standard",
          brand_id: null,
        },
      ],
      activeCustomerIds: new Set(["C1"]),
    });

    expect(rows).toHaveLength(1);
    expect(rows[0].brand_id).toBeNull();
    expect(rows[0].product).toBe("Standard");
  });

  it("skips subs whose delivery days exclude the weekday", () => {
    const { rows, counters } = buildDailyLogRows({
      ...baseArgs,
      subscriptions: [
        {
          customer_id: "C1",
          delivery_days: [3, 4],
          qty: 1,
          milk_type: "Full Cream",
          brand_id: "B1",
        },
      ],
      activeCustomerIds: new Set(["C1"]),
    });

    expect(rows).toEqual([]);
    expect(counters.skippedWrongDay).toBe(1);
  });

  it("skips inactive customers and paused customers", () => {
    const subs = [
      {
        customer_id: "CI",
        delivery_days: [1],
        qty: 1,
        milk_type: "Full Cream",
        brand_id: "B1",
      },
      {
        customer_id: "CP",
        delivery_days: [1],
        qty: 1,
        milk_type: "Full Cream",
        brand_id: "B1",
      },
      {
        customer_id: "CO",
        delivery_days: [1],
        qty: 1,
        milk_type: "Full Cream",
        brand_id: "B1",
      },
    ];
    const { rows, counters } = buildDailyLogRows({
      ...baseArgs,
      subscriptions: subs,
      // CP is both paused AND inactive — the active check runs first.
      activeCustomerIds: new Set(["CO", "CP"]),
      pausedCustomerIds: new Set(["CP"]),
    });

    expect(rows.map((r) => r.customer_id)).toEqual(["CO"]);
    expect(counters.skippedInactiveCust).toBe(1);
    expect(counters.skippedPaused).toBe(1);
  });

  it("skips rows whose (customer, brand, type) key already exists", () => {
    const { rows, counters } = buildDailyLogRows({
      ...baseArgs,
      subscriptions: [
        {
          customer_id: "C1",
          delivery_days: [1],
          qty: 1,
          milk_type: "Full Cream",
          brand_id: "B1",
        },
        {
          customer_id: "C1",
          delivery_days: [1],
          qty: 2,
          milk_type: "Toned",
          brand_id: "B1",
        },
      ],
      activeCustomerIds: new Set(["C1"]),
      existingKeys: new Set(["C1|B1|Full Cream"]),
    });

    expect(rows.map((r) => r.product)).toEqual(["Toned"]);
    expect(counters.skippedExisting).toBe(1);
  });

  it("treats a null-brand existing key as the empty-string key", () => {
    const { rows, counters } = buildDailyLogRows({
      ...baseArgs,
      subscriptions: [
        {
          customer_id: "C1",
          delivery_days: [1],
          qty: 1,
          milk_type: "Full Cream",
          brand_id: null,
        },
      ],
      activeCustomerIds: new Set(["C1"]),
      existingKeys: new Set(["C1||Full Cream"]),
    });

    expect(rows).toEqual([]);
    expect(counters.skippedExisting).toBe(1);
  });

  it("ignores customers with no active subscription at all", () => {
    const { rows, counters } = buildDailyLogRows({
      ...baseArgs,
      activeCustomerIds: new Set(["C1"]),
    });

    expect(rows).toEqual([]);
    expect(counters).toEqual({
      skippedExisting: 0,
      skippedPaused: 0,
      skippedWrongDay: 0,
      skippedInactiveCust: 0,
    });
  });

  it("does not mutate its inputs", () => {
    const subscriptions = [
      {
        customer_id: "C1",
        delivery_days: [1],
        qty: 1,
        milk_type: "Full Cream",
        brand_id: "B1",
      },
    ];
    const snapshot = JSON.stringify(subscriptions);
    const existingKeys = new Set(["nope"]);
    buildDailyLogRows({
      ...baseArgs,
      subscriptions,
      activeCustomerIds: new Set(["C1"]),
      existingKeys,
    });
    expect(JSON.stringify(subscriptions)).toBe(snapshot);
    expect(existingKeys).toEqual(new Set(["nope"]));
  });

  it("defaults a missing milk_type to Full Cream", () => {
    const { rows } = buildDailyLogRows({
      ...baseArgs,
      subscriptions: [
        { customer_id: "C1", delivery_days: [1], qty: 1, brand_id: "B1" },
      ],
      activeCustomerIds: new Set(["C1"]),
    });

    expect(rows[0].product).toBe("Full Cream");
  });
});
