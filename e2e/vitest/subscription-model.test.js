// e2e/vitest/subscription-model.test.js
//
// Integration coverage for the subscription-centric model (migration
// 20261101165247_subscription_centric_model):
//
//   1. A customer with TWO subscriptions of different milk types generates
//      TWO daily_logs rows for the same date (row identity is
//      (customer_id, date, product)).
//   2. generate_month_bill_rpc prices EACH product at its own active brand
//      rate (per-product billing, not one customer-wide rate).
//   3. record_ad_hoc_log_rpc accumulates per (customer, date, product) — an
//      extra delivery of product B must not touch product A's row.
//   4. The partial unique index rejects a second ACTIVE subscription of the
//      same milk type for one customer (while allowing an inactive one).
//
// Self-skips without SUPABASE env / operator PIN — same contract as the
// sibling api-integration.test.js.

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createClient } from "@supabase/supabase-js";
import { getEnv } from "./_client.mjs";

const env = getEnv();
const URL = env.SUPABASE_URL || env.VITE_SUPABASE_URL;
const KEY = env.SUPABASE_ANON_KEY || env.VITE_SUPABASE_ANON_KEY;
const PIN = env.E2E_OPERATOR_PIN;
const EMAIL = env.E2E_OPERATOR_EMAIL || "astamaniac001@gmail.com";

const shouldRun = !!(URL && KEY && PIN);

const IST_DATE = () =>
  new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });

describe.skipIf(!shouldRun)(
  "subscription-centric model (live Supabase)",
  () => {
    let supabase;
    let callApi;
    let probe = null; // { customerId, subA, subB, productA, productB, qtyA, qtyB, rateA, rateB }

    beforeAll(async () => {
      supabase = createClient(URL, KEY, {
        auth: { persistSession: false, autoRefreshToken: false },
      });
      const { data, error } = await supabase.auth.signInWithPassword({
        email: EMAIL,
        password: PIN,
      });
      if (error) throw new Error(`operator login failed: ${error.message}`);

      const { supabase: appClient } =
        await import("../../src/lib/supabaseClient.js");
      await appClient.auth.setSession({
        access_token: data.session.access_token,
        refresh_token: data.session.refresh_token,
      });
      const mod = await import("../../src/lib/api.js");
      callApi = mod.callApi;

      // Pick the brands the RPC will actually use. The RPC resolves a rate per
      // milk type with `WHERE default_milk_type = <product> AND status='Active'
      // ORDER BY created_at DESC LIMIT 1` — mirror that selection exactly so
      // the expected amount matches what the RPC charges.
      const { data: brands, error: brandErr } = await supabase
        .from("milk_brands")
        .select(
          "brand_name, default_milk_type, rate_per_liter, created_at, status",
        )
        .eq("status", "Active")
        .not("default_milk_type", "is", null)
        .not("rate_per_liter", "is", null)
        .order("created_at", { ascending: false });
      if (brandErr) throw new Error(`brand probe failed: ${brandErr.message}`);

      const rateFor = (type) => {
        const match = (brands || []).find(
          (b) => b.default_milk_type === type && Number(b.rate_per_liter) > 0,
        );
        return match ? Number(match.rate_per_liter) : 0;
      };

      const productA =
        (brands || []).find((b) => Number(b.rate_per_liter) > 0)
          ?.default_milk_type || "Full Cream";
      const rateA = rateFor(productA);
      // Product B is a second type for the same customer. Its rate is looked
      // up independently; when the operator has no brand for it, the billing
      // assertion is skipped (the RPC is expected to fail loudly instead).
      const productB = productA === "Toned" ? "Full Cream" : "Toned";
      const rateB = rateFor(productB);

      const stamp = Date.now().toString().slice(-9);
      const cname = `__e2e__ SubModel ${stamp}`;
      const phone = `9${stamp.padStart(9, "0").slice(-9)}`;

      const { data: cust, error: custErr } = await supabase
        .from("customers")
        .insert({
          name: cname,
          phone,
          delivery_address: "e2e",
          status: "Active",
        })
        .select("id")
        .single();
      if (custErr)
        throw new Error(`probe customer insert failed: ${custErr.message}`);

      const allDays = JSON.stringify([0, 1, 2, 3, 4, 5, 6]);
      const { data: subA, error: subAErr } = await supabase
        .from("subscriptions")
        .insert({
          customer_id: cust.id,
          milk_type: productA,
          qty: 1,
          delivery_days: allDays,
          is_active: true,
        })
        .select("id")
        .single();
      if (subAErr)
        throw new Error(`subscription A insert failed: ${subAErr.message}`);

      const { data: subB, error: subBErr } = await supabase
        .from("subscriptions")
        .insert({
          customer_id: cust.id,
          milk_type: productB,
          qty: 2,
          delivery_days: allDays,
          is_active: true,
        })
        .select("id")
        .single();
      if (subBErr)
        throw new Error(`subscription B insert failed: ${subBErr.message}`);

      probe = {
        customerId: cust.id,
        subA: subA.id,
        subB: subB.id,
        productA,
        productB,
        qtyA: 1,
        qtyB: 2,
        rateA,
        rateB,
        phone,
      };
    });

    afterAll(async () => {
      if (!probe) return;
      // daily_logs / bills / subscriptions cascade on customer delete, but
      // delete explicitly so the probe leaves nothing behind even if a
      // constraint changes.
      await supabase
        .from("daily_logs")
        .delete()
        .eq("customer_id", probe.customerId);
      await supabase.from("bills").delete().eq("customer_id", probe.customerId);
      await supabase
        .from("subscriptions")
        .delete()
        .eq("customer_id", probe.customerId);
      await supabase.from("customers").delete().eq("id", probe.customerId);
    });

    it("generates one daily_logs row per subscription product for the same date", async () => {
      const today = IST_DATE();
      const res = await callApi("generateDailyLogsForDate", { date: today });

      const { data: logs, error } = await supabase
        .from("daily_logs")
        .select("id, product, qty, delivered, customer_id")
        .eq("customer_id", probe.customerId)
        .eq("date", today);
      if (error) throw new Error(`log read failed: ${error.message}`);

      expect(logs).toHaveLength(2);
      const byProduct = new Map(logs.map((l) => [l.product, l]));
      expect(byProduct.has(probe.productA)).toBe(true);
      expect(byProduct.has(probe.productB)).toBe(true);
      expect(Number(byProduct.get(probe.productA).qty)).toBe(1);
      expect(Number(byProduct.get(probe.productB).qty)).toBe(2);
      expect(res.created).toBeGreaterThanOrEqual(2);
    });

    it("record_ad_hoc_log_rpc accumulates per product without touching the other product's row", async () => {
      const today = IST_DATE();
      await callApi("addAdHocLog", {
        customerId: probe.customerId,
        date: today,
        qty: 3,
        product: probe.productB,
        reason: "sub-model probe",
      });

      const { data: logs, error } = await supabase
        .from("daily_logs")
        .select("product, qty, note")
        .eq("customer_id", probe.customerId)
        .eq("date", today);
      if (error) throw new Error(`log read failed: ${error.message}`);

      const byProduct = new Map(logs.map((l) => [l.product, l]));
      // Product B accumulated (2 + 3); product A untouched.
      expect(Number(byProduct.get(probe.productB).qty)).toBe(5);
      expect(Number(byProduct.get(probe.productA).qty)).toBe(1);
      expect(byProduct.get(probe.productB).note).toContain("Extra");
    });

    it("rejects a second ACTIVE subscription of the same milk type (unique index)", async () => {
      const { error } = await supabase.from("subscriptions").insert({
        customer_id: probe.customerId,
        milk_type: probe.productA,
        qty: 1,
        delivery_days: JSON.stringify([1]),
        is_active: true,
      });
      expect(error).not.toBeNull();
      expect(error.code).toBe("23505");
    });

    it("allows an INACTIVE duplicate subscription of the same milk type", async () => {
      const { error } = await supabase.from("subscriptions").insert({
        customer_id: probe.customerId,
        milk_type: probe.productA,
        qty: 1,
        delivery_days: JSON.stringify([1]),
        is_active: false,
      });
      expect(error).toBeNull();
    });

    it("generate_month_bill_rpc prices each product at its own active rate", async () => {
      if (!probe.rateA || !probe.rateB) return; // no brand for product B — nothing to assert
      const today = IST_DATE();
      const month = today.substring(0, 7);

      // Mark both of today's logs delivered so they count toward the bill.
      await supabase
        .from("daily_logs")
        .update({ delivered: true })
        .eq("customer_id", probe.customerId)
        .eq("date", today);

      await callApi("generateMonthBill", {
        customerId: probe.customerId,
        month,
      });

      const { data: bills, error } = await supabase
        .from("bills")
        .select("amount, status, month")
        .eq("customer_id", probe.customerId)
        .eq("month", month)
        .limit(1);
      if (error) throw new Error(`bill read failed: ${error.message}`);
      expect(bills).toHaveLength(1);

      // Expected amount = Σ (delivered qty of each product × that product's
      // own rate). A single-rate implementation would charge one rate for the
      // combined quantity and fail this assertion.
      const { data: deliveredLogs } = await supabase
        .from("daily_logs")
        .select("product, qty")
        .eq("customer_id", probe.customerId)
        .eq("date", today)
        .eq("delivered", true);
      let expected = 0;
      for (const l of deliveredLogs || []) {
        const rate = l.product === probe.productA ? probe.rateA : probe.rateB;
        expected += Number(l.qty) * rate;
      }
      expect(expected).toBeGreaterThan(0);
      expect(Number(bills[0].amount)).toBeCloseTo(expected, 2);
    });
  },
);
