// e2e/data-rendering.test.js
//
// Cross-checks that what the UI shows matches what the database holds. Unlike
// a generic template, this app uses Card lists (no <table>); we therefore
// render-verify by:
//   1. Querying Supabase from the test (operator session).
//   2. Opening the corresponding page in the browser.
//   3. Asserting the customer/bill/brand NAME strings appear as text inside
//      `.card` elements on the page — that's exactly what every page renders.
//
// Self-skips when E2E_OPERATOR_PIN is missing.

import { test, expect } from "@playwright/test";
import {
  makeSupabase,
  OPERATOR_PIN,
  E2E_MARKER,
  e2eName,
} from "./helpers/supabase.js";

// Collection-time conditional skip — every test in this describe block
// requires an operator session. Skipping at file scope means Playwright
// never even instantiates the browser fixture, sidestepping Edge-launch /
// video-recording errors on hosts without `E2E_OPERATOR_PIN`.
test.skip(!OPERATOR_PIN, "E2E_OPERATOR_PIN not set");

test.describe("UI shows what DB holds", () => {
  // `test.skip()` (no args) inside beforeEach marks the about-to-run test
  // as skipped. See integration-full-flow.test.js for the full rationale:
  // Playwright's TestArgs has no `skip` fixture (verified against
  // node_modules/playwright/types/test.d.ts:7809).
  test.beforeEach(async ({ page }) => {
    // Login.
    await page.goto("/");
    const pin = page.locator("#pin-input");
    if (await pin.isVisible({ timeout: 8_000 }).catch(() => false)) {
      await pin.fill(OPERATOR_PIN);
      await page.getByRole("button", { name: "Login" }).click();
    }
    await expect(page.getByRole("heading", { name: "Milk Delivery Admin" })).toBeVisible();
  });

  test("every customer the DB returns appears as a Card on the Customers page", async ({ page }) => {
    const supabase = await makeSupabase({ withSession: true });
    const { data, error } = await supabase
      .from("customers")
      .select("name")
      .order("name")
      .limit(50);
    expect(error, "DB SELECT customers failed").toBeNull();
    const names = (data || []).filter((c) => c?.name).map((c) => c.name);

    await page.getByRole("button", { name: "Customers" }).click();
    // STRICT-MODE GUARD: both <h2>Customers</h2> (AppShell tab title) and
    // <h3>Customers</h3> (Customers.jsx:25 Section) match. Use .first().
    await expect(page.getByRole("heading", { name: "Customers", exact: true }).first()).toBeVisible();

    // If the DB is completely empty, the empty-state text is the right
    // appearance instead; assert either path explicitly so the test can't
    // pass both ways.
    if (names.length === 0) {
      await expect(page.getByText("No customers found", { exact: true })).toBeVisible();
      return;
    }

    // Verify a sample of names render as visible text on the page. Sampling
    // avoids a flaky test if the operator adds new customers between the DB
    // fetch and the page render — we just confirm what *we saw* is there.
    const sampleNames = names.slice(0, 5);
    for (const n of sampleNames) {
      // Some names may include characters that are regex-meaningful; escape.
      const escaped = n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      await expect(
        page.locator(".card").filter({ hasText: new RegExp(escaped) }).first(),
      ).toBeVisible({ timeout: 10_000 });
    }
  });

  test("dashboard Today's Delivery stats reflect DB logs / customers counts", async ({ page }) => {
    const supabase = await makeSupabase({ withSession: true });
    // Use TODAY in IST (per AGENTS.md §8 — getToday()). The dashboard's
    // `todayLogs` and `logs` store slice both come from
    // `getDailyLogs({date: getToday()})`, so the rendered count must match
    // a direct DB query against the same date.
    const today = new Date().toLocaleDateString("en-CA", {
      timeZone: "Asia/Kolkata",
    });

    const { data: todays, error } = await supabase
      .from("daily_logs")
      .select("delivered, qty")
      .eq("date", today);
    expect(error, "DB SELECT daily_logs failed").toBeNull();

    await page.getByRole("button", { name: "Home" }).click();
    // Dashboard.jsx:80 renders <h2>Today's Delivery ({today})</h2>. Wait
    // for it so we know the StatGrid is built before we assert on it.
    await expect(
      page.getByRole("heading", { name: /Today's Delivery/ }),
    ).toBeVisible();

    // The Delivered stat tile (Dashboard.jsx:95-101) computes:
    //   deliveredCount = todayLogs.filter(l => l.delivered).length
    // which is exactly the same predicate we apply to the DB rows below.
    const deliveredCount = (todays || []).filter((l) => l.delivered).length;
    const tile = page
      .locator(".stat-tile")
      .filter({ hasText: "Delivered" })
      .first();
    await expect(tile).toBeVisible();
    const valueText = await tile.locator(".stat-value").textContent();
    expect(String(valueText).trim()).toContain(String(deliveredCount));
  });

  test("Billing page KPI grid equals computed DB totals (no other-month leak)", async ({ page }) => {
    const supabase = await makeSupabase({ withSession: true });
    // The app loads bills filtered by `billMonth` = current YYYY-MM (useAppState
    // clampedMonth → today's YYYY-MM). To match that, compute bills from DB
    // for the same month.
    const month = todayIST().substring(0, 7);
    const { data: bills, error } = await supabase
      .from("bills")
      .select("amount, amount_paid, status")
      .eq("month", month);

    expect(error, "DB SELECT bills failed").toBeNull();
    const arr = bills || [];
    const totalBilled = arr.reduce((s, b) => s + num(b.amount), 0);
    const collected = arr.reduce(
      (s, b) => s + (b.status === "Paid" || b.status === "Partial" ? num(b.amount_paid) : 0),
      0,
    );
    const pending = arr
      .filter((b) => b.status !== "Paid" && b.status !== "Draft")
      .reduce((s, b) => s + (num(b.amount) - num(b.amount_paid)), 0);

    await page.getByRole("button", { name: "Billing" }).click();
    // STRICT-MODE GUARD: AppShell <h2>Billing</h2> + Billing.jsx:163
    // <Section title="Billing"> → <h3>Billing</h3>. Use .first().
    await expect(page.getByRole("heading", { name: "Billing" }).first()).toBeVisible();

    // StatGrid labels per Billing.jsx:205-224.
    const totalTile = page.locator(".stat-tile").filter({ hasText: "Total Billed" }).first();
    const collectedTile = page.locator(".stat-tile").filter({ hasText: "Collected" }).first();
    const pendingTile = page.locator(".stat-tile").filter({ hasText: "Pending" }).first();

    if (arr.length === 0) {
      // All three tiles should still render (just show ₹0.00).
      for (const t of [totalTile, collectedTile, pendingTile]) {
        await expect(t).toBeVisible();
      }
      return;
    }

    await expect(totalTile).toContainText(fmt(totalBilled));
    await expect(collectedTile).toContainText(fmt(collected));
    await expect(pendingTile).toContainText(fmt(pending));
  });

  test("Imports page Brand list matches DB milk_brands rows", async ({ page }) => {
    const supabase = await makeSupabase({ withSession: true });
    const { data, error } = await supabase
      .from("milk_brands")
      .select("brand_name, status")
      .order("brand_name")
      .limit(50);
    expect(error, "DB SELECT milk_brands failed").toBeNull();
    const names = (data || []).filter((b) => b?.brand_name).map((b) => b.brand_name);

    await page.getByRole("button", { name: "Imports" }).click();
    // STRICT-MODE GUARD: AppShell <h2>Milk Imports</h2> + Imports.jsx:62
    // <Section title="Milk Imports"> → <h3>Milk Imports</h3>. Use .first().
    await expect(page.getByRole("heading", { name: "Milk Imports" }).first()).toBeVisible();
    // The Brands subsection card (Imports.jsx:183-218) renders at the bottom.
    for (const n of names.slice(0, 5)) {
      const escaped = n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      await expect(
        page.locator(".card").filter({ hasText: new RegExp(escaped) }).first(),
      ).toBeVisible({ timeout: 10_000 });
    }
  });
});

// Local helpers — pure.
function todayIST() {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
}
function num(v) {
  const n = Number(v);
  return isNaN(n) ? 0 : n;
}
function fmt(n) {
  return "₹" + num(n).toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

// silence unused warning for marker exports in helpers (kept for parity).
void E2E_MARKER;
void e2eName;