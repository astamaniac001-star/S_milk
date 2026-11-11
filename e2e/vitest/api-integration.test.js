// e2e/vitest/api-integration.test.js
//
// Vitest integration suite that exercises the REAL lib/api.js callApi switch
// against the live Supabase project (no browser required). Covers the same
// surface as the Playwright `database-connection.test.js` so the integration
// guarantees hold even when the host can't download a browser binary.
//
// Self-skips when SUPABASE env / E2E_OPERATOR_PIN is not configured so
// `npm test` (unit suite) does NOT suddenly depend on live network or
// operator credentials.

import { describe, it, expect, beforeAll } from "vitest";
import { createClient } from "@supabase/supabase-js";
import { getEnv } from "./_client.mjs";

const env = getEnv();
const URL = env.SUPABASE_URL || env.VITE_SUPABASE_URL;
const KEY = env.SUPABASE_ANON_KEY || env.VITE_SUPABASE_ANON_KEY;
const PIN = env.E2E_OPERATOR_PIN;
const EMAIL = env.E2E_OPERATOR_EMAIL || "astamaniac001@gmail.com";

const shouldRun = !!(URL && KEY);

describe.skipIf(!shouldRun)(
  "lib/api.js ↔ live Supabase (operator session)",
  () => {
    let supabase;
    let callApi;
    let appSupabase;

    beforeAll(async () => {
      supabase = createClient(URL, KEY, {
        auth: { persistSession: false, autoRefreshToken: false },
      });
      if (PIN) {
        const { data, error } = await supabase.auth.signInWithPassword({
          email: EMAIL,
          password: PIN,
        });
        if (error) throw new Error(`operator login failed: ${error.message}`);

        // CRITICAL FIX: `callApi` does NOT use the test's `supabase` client.
        // Every per-domain file in src/lib/api/<domain>.js imports the
        // singleton `supabase` from `src/lib/supabaseClient.js`, which is
        // an ANONYMOUS client (`autoRefreshToken: true, persistSession: true`).
        // Without seeding its in-memory session store, every callApi action
        // hits RLS as anon → 42501 permission denied. We bridge the gap by
        // importing the app's singleton and calling `setSession(...)` with
        // the access/refresh tokens we just obtained — exactly what useAuth
        // does in the browser via `signInWithPassword` (see useAuth.js).
        const { supabase: appClient } =
          await import("../../src/lib/supabaseClient.js");
        appSupabase = appClient;
        await appSupabase.auth.setSession({
          access_token: data.session.access_token,
          refresh_token: data.session.refresh_token,
        });
      }
      // Dynamic import so we exercise the actual barrel (lib/api.js).
      const mod = await import("../../src/lib/api.js");
      callApi = mod.callApi;
    });

    it("anon client is blocked from reading business tables (RLS row filter OR privilege revocation)", async () => {
      const anon = createClient(URL, KEY, {
        auth: { persistSession: false },
      });
      const { data, error } = await anon
        .from("customers")
        .select("id")
        .limit(1);
      // The deployed project gates anon via one of two equally-valid controls:
      //   (a) GRANT-based privilege revocation (42501 permission denied) —
      //       current deployment: anon role has no SELECT on `customers`.
      //   (b) RLS row filter (returns 200 OK with empty array) — common when
      //       the same table is shared with an authenticated audience.
      // Both outcomes prove anon cannot read customer rows; either is a pass.
      if (error) {
        // Outcome (a): PostgREST surfaces a 42501 permission-denied error.
        expect(error.code).toBe("42501");
        expect(error.message).toMatch(/permission denied|denied for table/i);
        expect(data).toBeNull();
      } else {
        // Outcome (b): RLS returns an empty array.
        expect(Array.isArray(data)).toBe(true);
        expect(data.length).toBe(0);
      }
    });

    // The remaining tests require the authenticated operator session so we
    // skip them when PIN isn't provided.
    describe.skipIf(!PIN)("callApi returns expected shapes", () => {
      // VERIFIED against src/lib/api/customers.js:7-14 — getCustomers returns
      // { customers: RAW rows } (snake_case). The UI mapping happens later,
      // in useEntityStore.js:68 via custs.map(mapCustomerFromApi). Pinning the
      // raw shape here is what catches accidental double-mapping (rule §4):
      // if a future change adds a map() in api.js, the store would then
      // double-map it and turn fields to undefined.
      it("getCustomers returns { customers: RAW snake_case rows } (mapping happens in store)", async () => {
        const r = await callApi("getCustomers", {});
        expect(r).toHaveProperty("customers");
        expect(Array.isArray(r.customers)).toBe(true);
        // Raw shape contract — DB column names, not camelCase.
        if (r.customers.length > 0) {
          const c = r.customers[0];
          expect(c).toHaveProperty("name");
          expect(c).toHaveProperty("delivery_address"); // snake_case
          expect(c).toHaveProperty("delivery_days"); // JSONB
          expect(c).toHaveProperty("daily_qty");
          // The store-side mapper must NOT already run here.
          expect(c).not.toHaveProperty("deliveryDays");
          expect(c).not.toHaveProperty("qty");
        }
      });

      // VERIFIED against src/lib/api/billing.js:15-21 — getBills DOES map via
      // mapBillFromApi (unlike getCustomers). So bills come back UI-shaped.
      it("getBills returns MAPPED UI bills (rule §4 — billing.js maps inside callApi)", async () => {
        const r = await callApi("getBills", {});
        expect(r).toHaveProperty("bills");
        expect(Array.isArray(r.bills)).toBe(true);
        if (r.bills.length > 0) {
          const b = r.bills[0];
          expect(b).toHaveProperty("custId");
          expect(b).toHaveProperty("amount");
          expect(b).toHaveProperty("paid");
          expect(b).toHaveProperty("locked");
          // Double-mapping regression trap: snake_case MUST NOT leak through.
          expect(b).not.toHaveProperty("amount_paid");
          expect(b).not.toHaveProperty("customer_id");
        }
      });

      // VERIFIED against src/lib/api/imports.js:34-41 — getMilkImports returns
      // RAW snake_case rows; mapping happens in useEntityStore.js:69.
      it("getMilkImports returns raw rows for the store to map (mirror of getCustomers)", async () => {
        const r = await callApi("getMilkImports", {});
        expect(r).toHaveProperty("imports");
        expect(Array.isArray(r.imports)).toBe(true);
        if (r.imports.length > 0) {
          const i = r.imports[0];
          expect(i).toHaveProperty("brand_name"); // snake_case
          expect(i).toHaveProperty("quantity");
          expect(i).toHaveProperty("rate_per_liter");
          expect(i).toHaveProperty("version");
          expect(i).not.toHaveProperty("brand"); // mapped name absent
          expect(i).not.toHaveProperty("rate");
        }
      });

      it("getDailyInventory computes a numeric shortage/remaining for today", async () => {
        const r = await callApi("getDailyInventory", {});
        expect(r).toHaveProperty("date");
        expect(r).toHaveProperty("totalImported");
        expect(r).toHaveProperty("totalDelivered");
        expect(r).toHaveProperty("remaining");
        expect(r).toHaveProperty("shortage");
        expect(typeof r.remaining).toBe("number");
        expect(typeof r.shortage).toBe("number");
        // Invariant: remaining >= 0 and shortage >= 0 (api/delivery.js guards).
        expect(r.remaining).toBeGreaterThanOrEqual(0);
        expect(r.shortage).toBeGreaterThanOrEqual(0);
      });

      it("unknown action throws (no silent success — rule §1)", async () => {
        await expect(callApi("nonExistentAction", {})).rejects.toThrow(
          /Unknown action: nonExistentAction/,
        );
      });
    });
  },
);

// Quick sanity test that always runs when env is configured proves URL+KEY
// are valid HTTP-wise. Accepts EITHER the privilege-revocation security
// model (returns 42501) OR the RLS row-filter model (returns 200 + empty).
describe.skipIf(!shouldRun)("supabase project is reachable", () => {
  it("anon GET /customers reaches the project (hard error or empty array — both prove liveness)", async () => {
    const supa = createClient(URL, KEY, {
      auth: { persistSession: false },
    });
    const { data, error } = await supa.from("customers").select("id").limit(1);
    // Either outcome proves the project is reachable and the anon key
    // authenticated at the URL level. An unreachable project would 404 or
    // network-error before PostgREST could respond with either of these.
    expect(
      error === null || error?.code === "42501",
      `unexpected error: ${error?.message}`,
    ).toBe(true);
    expect(data === null || Array.isArray(data)).toBe(true);
  });
});
