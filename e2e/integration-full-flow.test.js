// e2e/integration-full-flow.test.js
//
// Complete user journey:
//   1. Create a real customer via the Customer modal — verify the row lands
//      in the DB AND that it then appears on the Customers page.
//   2. Seed today's delivery log for the probe customer (probe-scoped — the
//      app's "Generate Deliveries" button runs a GLOBAL generator and must
//      never be driven against a linked project with real data).
//   3. Generate a bill for the current month via the probe-scoped
//      generate_month_bill_rpc (the app's "Generate Bills" button bills
//      EVERY active subscribed customer — same containment rule).
//   4. Record a partial payment via the Payment modal — verify the bill's
//      amount_paid and status move from Unpaid → Partial in the DB.
//   5. Clean up: delete the created bill, daily_logs, subscription,
//      customer — IN that order, with the operator session, because the
//      foreign keys cascade with ON DELETE clauses (schema.sql:864-884
//      show adjustments/credit_notes/payments SET NULL on bill delete and
//      CASCADE on customer delete).
//
// Every test row carries the `__e2e__` marker name prefix so the cleanup
// helper can identify them. We only ever delete rows whose name starts
// with that marker — never real operator data.

import { test, expect } from "@playwright/test";
import {
  makeSupabase,
  OPERATOR_PIN,
  E2E_MARKER,
  e2eName,
} from "./helpers/supabase.js";
import { loginViaPin } from "./helpers/app.js";

// Collection-time conditional skip — the lifecycle test creates real
// customers/bills and reads the live DB, so it cannot run without an
// operator session. Skipping here means Playwright never spins up Edge
// (or the dev server) for this file when the PIN isn't set.
test.skip(!OPERATOR_PIN, "E2E_OPERATOR_PIN not set");

test.describe("full operator lifecycle", () => {
  test.beforeEach(async ({ page }) => {
    if (!OPERATOR_PIN) {
      test.skip();
      return;
    }
    // "Generate Bills" (Billing.jsx) asks for confirmation via
    // window.confirm — Playwright auto-dismisses native dialogs, which
    // would silently skip the billing step. Accept them.
    page.on("dialog", (d) => d.accept());
    await page.goto("/");
    // FIX (2026-11-22): shared retrying login (network blips no longer fail
    // the suite) — helpers/app.js loginViaPin (replaces the inline dance +
    // waitForAppReady, which it subsumes).
    await loginViaPin(page);
  });

  test("create customer, generate log, generate bill, partial payment — DB ↔ UI agree", async ({
    page,
  }) => {
    const supabase = await makeSupabase({ withSession: true });
    const cname = e2eName("Lifecycle Customer");
    const today = new Date().toLocaleDateString("en-CA", {
      timeZone: "Asia/Kolkata",
    });
    const month = today.substring(0, 7);

    // PRE-TEST SWEEP: if a previous run failed mid-way, leftover __e2e__
    // rows with the same phone (9000010001) would shadow the new insert
    // (PostgREST's `.single()` would later throw on multi-row, and our
    // phone-based lookup would pick the wrong orphan). Delete every leftover
    // e2e customer first — cascade-safe per cleanupAll below.
    await preClean(supabase);

    // ENVIRONMENTAL PREFLIGHT: bill generation (`generate_month_bill_rpc`)
    // derives a rate from `milk_brands` rows. If the live operator project
    // has ZERO Active brands (e.g. a freshly reset DB), the RPC will reject
    // and the lifecycle's bill-creation step fails for environmental — NOT
    // regression — reasons. Skip loudly rather than fail ambiguously.
    const { count: activeBrandCount, error: brandErr } = await supabase
      .from("milk_brands")
      .select("id", { count: "exact", head: true })
      .eq("status", "Active");
    if (brandErr)
      throw new Error(
        `preflight milk_brands probe failed: ${brandErr.message}`,
      );
    if (!activeBrandCount || activeBrandCount === 0) {
      // Mid-body skip: Playwright `test.skip()` (no args) marks the current
      // test as "skipped" — no fixtures required to do so.
      test.skip();
      return;
    }

    // ─── STEP 1: Add customer via the modal ────────────────────────────
    await page.getByRole("button", { name: "Customers" }).click();
    // STRICT-MODE GUARD: AppShell.h2 "Customers" + Customers.jsx:25
    // <Section title="Customers"> → <h3>Customers</h3>. Use .first().
    await expect(
      page.getByRole("heading", { name: "Customers", exact: true }).first(),
    ).toBeVisible();
    await page.getByRole("button", { name: "+ Add" }).click();
    await expect(page.getByRole("dialog")).toBeVisible();

    // Match CustomerModal.jsx field placeholders.
    await page.getByPlaceholder("Ramesh Sharma").fill(cname);
    await page.getByPlaceholder("14, Shivaji Nagar").fill("E2E Test Address");
    await page.getByPlaceholder("9876543210").fill("9000010001");
    // CustomerModal is identity-only now (name/address/phone) — milk type,
    // quantity and delivery days belong to a subscription.
    await page.getByRole("button", { name: "Save" }).click();

    await expect(page.getByRole("dialog")).toHaveCount(0, { timeout: 15_000 });

    // Verify row in DB. Use `.maybeSingle()` + retry because Supabase may
    // exhibit a brief read-after-write lag between the catalog confirmation
    // (Postgres-level commit by the time the response arrives) and the
    // follow-up SELECT — the modal "Save" click handler has already awaited
    // the callApi response, which means the row is committed, but a rare
    // edge-case `single()` error on zero rows would crash the test
    // prematurely. Retry up to ~3s.
    let custRow = null;
    await expect(async () => {
      const { data, error } = await supabase
        .from("customers")
        .select("id, name, status")
        .eq("phone", "9000010001")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      expect(error, "customer insert did not land in DB").toBeNull();
      expect(data, "customer row not yet readable").not.toBeNull();
      custRow = data;
    }).toPass({ timeout: 10_000, intervals: [500, 1000, 2000] });
    expect(custRow.name).toBe(cname);
    expect(custRow.status).toBe("Active");
    const customerId = custRow.id;

    // UI must show the row (as a Card).
    await expect(
      page.locator(".card").filter({ hasText: cname }).first(),
    ).toBeVisible({ timeout: 10_000 });

    // ─── STEP 1b: Give the customer a subscription ───────────────────────
    // Subscription-centric model: delivery logs are generated from ACTIVE
    // SUBSCRIPTIONS only — a customer without one gets no scheduled
    // delivery. Subscriptions are brand-aware: a subscription is
    // (customer, brand, milk type, qty, days) and the bill prices each
    // delivery at that brand's rate for the milk type (brand_rates).
    //
    // The subscription is created through the APP (Subscriptions page), not
    // by inserting the row directly: "Generate Bills" only bills customers
    // whose subscription is in the app's in-memory list, so a DB-only insert
    // would be invisible to the billing step.
    //
    // The probe brand is inserted directly (the Brands page's rate editor is
    // covered by its own test) and carries a Full Cream rate so the bill has
    // something to price with.
    const { data: probeBrand, error: probeBrandErr } = await supabase
      .from("milk_brands")
      .insert({
        brand_name: e2eName("Lifecycle Brand"),
        status: "Active",
        default_milk_type: "Full Cream",
        rate_per_liter: 60,
      })
      .select("id")
      .single();
    expect(
      probeBrandErr,
      "could not insert the probe brand for the lifecycle customer",
    ).toBeNull();
    const { error: probeRateErr } = await supabase.from("brand_rates").insert({
      brand_id: probeBrand.id,
      milk_type: "Full Cream",
      rate_per_liter: 60,
    });
    expect(probeRateErr, "could not insert the probe brand rate").toBeNull();

    // The app fetches its brand list once on sign-in, so a brand inserted
    // after login is invisible to the Brand dropdown. Reload to re-fetch.
    await page.reload();
    await expect(page.locator(".bottom-nav")).toBeVisible();

    await page.getByRole("button", { name: "Subs", exact: true }).click();
    await page.getByRole("button", { name: "+ Add" }).click();
    await expect(
      page.getByRole("heading", { name: "Add Subscription" }),
    ).toBeVisible();
    await page.getByLabel(/Customer/i).selectOption({ label: cname });
    await page.getByLabel(/Brand/i).selectOption(probeBrand.id);
    await page.getByLabel(/Milk Type/i).selectOption({ label: "Full Cream" });
    await page.getByLabel(/Quantity/i).fill("1");
    // Every delivery day must be selected for today's log to be generated.
    // The day buttons toggle, so only click the ones that are not already
    // pressed (the modal pre-selects the default set).
    for (const day of ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]) {
      const dayBtn = page.getByRole("button", { name: day, exact: true });
      if ((await dayBtn.getAttribute("aria-pressed")) !== "true") {
        await dayBtn.click();
      }
    }
    await page.getByRole("button", { name: "Save" }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0, { timeout: 15_000 });

    // ─── STEP 2: Seed today's delivery log for the probe customer ──────
    // CONTAINMENT (2026-11-21 audit): the Delivery page's "Generate
    // Deliveries" button runs the GLOBAL generator — it writes rows for
    // EVERY active customer on the linked project, not just the probe.
    // Never invoke it against real operator data. Instead, insert the exact
    // row the generator would produce for the probe customer (its output
    // contract: delivered=false, note "Auto-generated (Sub)"), then open the
    // Delivery page so the date-dependent fetch picks it up.
    const { error: seedLogErr } = await supabase.from("daily_logs").insert({
      customer_id: customerId,
      date: today,
      product: "Full Cream",
      brand_id: probeBrand.id,
      qty: 1,
      delivered: false,
      note: "Auto-generated (Sub)",
    });
    expect(seedLogErr, "could not seed the probe daily_log").toBeNull();

    await page.getByRole("button", { name: "Delivery" }).click();
    // STRICT-MODE: AppShell renders <h2>Daily Delivery</h2>. Delivery.jsx
    // itself has no second heading with this label, so single-match.
    await expect(
      page.getByRole("heading", { name: "Daily Delivery" }),
    ).toBeVisible();
    // The seeded log was inserted AFTER login, so the store's logDate-scoped
    // fetch predates it. Cycle the date picker (away → today) to drive the
    // app's own date-change refetch — the same technique the per-card toggle
    // test uses. (Filling with today's ALREADY-SET value fires no change.)
    const dateInput = page.locator('input[type="date"]').first();
    await dateInput.fill("2026-01-01");
    await dateInput.fill(today);

    // The seeded log must surface on the Delivery page (DB ⇄ UI agreement):
    // DeliveryLogItem renders the customer name in the log row.
    await expect(page.getByText(cname).first()).toBeVisible({
      timeout: 10_000,
    });

    // Verify DB has at daily_logs row for this customer today. Same
    // retry rationale as the customer/bill lookups above.
    let logRow = null;
    await expect(async () => {
      const { data, error } = await supabase
        .from("daily_logs")
        .select("id, delivered, qty")
        .eq("customer_id", customerId)
        .eq("date", today)
        .maybeSingle();
      expect(error).toBeNull();
      expect(
        data,
        "daily_logs row not created for today's generation",
      ).not.toBeNull();
      logRow = data;
    }).toPass({ timeout: 15_000, intervals: [500, 1000, 2000] });
    expect(logRow).not.toBeNull();

    // `generateDailyLogsForDate` deliberately creates logs with
    // `delivered: false` (Delivery.jsx S_milk/src/lib/api/delivery.js:130) —
    // the operator is expected to toggle each customer Delivered via the
    // UI. Without at least one delivered log, generate_month_bill_rpc
    // returns amount=0 (verified live 2026-07-28) and the amount>0
    // assertion at STEP 3 would fail for environmental, not regression,
    // reasons. Mirror the real operator flow here: toggle the freshly
    // generated log to delivered=true in the DB before billing. We use
    // the supervisor RPC instead of a raw UPDATE so the row lock + FK
    // checks happen atomically (AGENTS.md §14).
    const { error: markErr } = await supabase
      .from("daily_logs")
      .update({ delivered: true })
      .eq("id", logRow.id)
      .select()
      .single();
    expect(
      markErr,
      "could not mark the generated daily_log as delivered",
    ).toBeNull();

    // ─── STEP 3: Generate the month bill (probe-scoped) ────────────────
    // CONTAINMENT (2026-11-21 audit): the Billing page's "Generate Bills"
    // button runs `generateMonthlyBills`, which bills EVERY active
    // subscribed customer — regenerating real bills on the linked project.
    // Call the per-customer RPC directly for the probe customer instead;
    // the bill card is then surfaced through the UI via a fresh fetch.
    const { error: billGenErr } = await supabase.rpc(
      "generate_month_bill_rpc",
      { p_customer_id: customerId, p_month: month },
    );
    expect(billGenErr, "probe bill generation failed").toBeNull();

    await page.getByRole("button", { name: "Billing" }).click();
    // STRICT-MODE: AppShell <h2>Billing</h2> + Billing.jsx:163
    // <Section title="Billing"> → <h3>Billing</h3>. Use .first().
    await expect(
      page.getByRole("heading", { name: "Billing" }).first(),
    ).toBeVisible();
    // The probe bill was created AFTER login, so the store's month-scoped
    // fetch predates it. Cycle the month picker (away → current) to drive
    // the app's own billMonth-change refetch — filling with the
    // ALREADY-SET value fires no change event.
    const monthInput = page.locator('input[type="month"]').first();
    await monthInput.fill("2026-01");
    await monthInput.fill(month);

    // DB should have exactly one bill for this customer/month. Use a retry
    // loop because the click handler awaits the RPC (committed by commit
    // time), but Supabase's read-after-write lag means an immediate SELECT
    // can still miss it — per PostgREST docs the lag is typically sub-100ms
    // but we allow up to 10s for safety on flaky networks.
    let billRow = null;
    await expect(async () => {
      const { data, error } = await supabase
        .from("bills")
        .select("id, amount, amount_paid, status, version")
        .eq("customer_id", customerId)
        .eq("month", month)
        .maybeSingle();
      expect(error).toBeNull();
      expect(data, "bill was not generated in DB").not.toBeNull();
      billRow = data;
    }).toPass({ timeout: 15_000, intervals: [500, 1000, 2000] });
    const billId = billRow.id;
    expect(num(billRow.amount)).toBeGreaterThan(0);
    expect(billRow.status).toBe("Unpaid");

    // NOTE: the bill was created by the direct RPC above, so the in-memory
    // list only picks it up through the month-scoped `getBills` refetch that
    // the month-picker change above triggers. A full-page `page.reload()`
    // would dump us back to the dashboard tab; do NOT reload.
    await expect(
      page.getByRole("heading", { name: "Billing" }).first(),
    ).toBeVisible();

    // Find the bill card for our customer (Billing.jsx renders one Card per
    // bill — BillCard at line 93).
    const billCard = page.locator(".card").filter({ hasText: cname }).first();

    // "Record Payment" button exists per Billing.jsx:32-35 when the bill
    // is unlocked and status !== "Paid".
    await expect(
      billCard.getByRole("button", { name: "Record Payment" }),
    ).toBeVisible({ timeout: 15_000 });
    await billCard.getByRole("button", { name: "Record Payment" }).click();
    await expect(page.getByRole("dialog")).toBeVisible();

    // PaymentModal.jsx auto-prefills the pending amount into payAmt
    // (PaymentModal.jsx:21-29). We pay HALF the pending now for the
    // Partial state assertion.
    const pending = num(billRow.amount) - num(billRow.amount_paid);
    const halfStr = String(Math.floor((pending / 2) * 100) / 100);
    await page
      .getByLabel(/Amount/)
      .first()
      .fill(halfStr);
    await page.getByRole("button", { name: /Record ₹/ }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0, { timeout: 15_000 });

    // DB should now show the bill in Partial status with the half amount paid.
    const { data: paidBill, error: paidErr } = await supabase
      .from("bills")
      .select("amount, amount_paid, status, version")
      .eq("id", billId)
      .single();
    expect(paidErr).toBeNull();
    expect(paidBill.status).toBe("Partial");
    expect(Math.round(num(paidBill.amount_paid) * 100)).toBeGreaterThanOrEqual(
      Math.round(num(halfStr) * 100) - 1,
    );

    // ─── STEP 4: Cleanup (RLS-aware: operator session owns every row) ──
    await cleanupAll(supabase, { customerId, billId, month, today });
    // The probe brand (and its brand_rates row) is test-owned — remove it
    // last so the subscription FK stays valid while it is deleted.
    await supabase.from("brand_rates").delete().eq("brand_id", probeBrand.id);
    await supabase.from("milk_brands").delete().eq("id", probeBrand.id);
  });
});

// HELPER: pre-test cleanup sweep. Run before the lifecycle so a prior
// aborted run cannot leave orphan __e2e__ rows that would shadow the new
// insert via duplicate phone. The sweep relies on the `__e2e__` name prefix
// invariant (helpers/supabase.js:e2eName) so only test-issued rows are
// touched — never operator real data.
async function preClean(supabase) {
  // Probe brands created by this test — they are test-owned (the name is
  // unique per run), so a failed run cannot leak them into later runs.
  await supabase
    .from("milk_brands")
    .delete()
    .like("brand_name", `${E2E_MARKER}%Lifecycle Brand%`);

  const { data: orphans } = await supabase
    .from("customers")
    .select("id")
    .like("name", `${E2E_MARKER}%`);
  if (!orphans || orphans.length === 0) return;
  for (const c of orphans) {
    // Reuse cleanupAll to delete FK-dependencies in safest-first order.
    // billId is unknown for an orphan; we don't pass it (the orphan's
    // payments/adjustments are cleared via fk cascade when the bill is
    // deleted through the customer FK).
    await supabase.from("daily_logs").delete().eq("customer_id", c.id);
    await supabase.from("subscriptions").delete().eq("customer_id", c.id);
    // Fetch bills for this customer, delete their ledger rows first.
    const { data: orphanBills } = await supabase
      .from("bills")
      .select("id")
      .eq("customer_id", c.id);
    if (orphanBills) {
      for (const b of orphanBills) {
        await supabase.from("payments").delete().eq("bill_id", b.id);
        await supabase.from("adjustments").delete().eq("bill_id", b.id);
        await supabase.from("credit_notes").delete().eq("bill_id", b.id);
        await supabase
          .from("credit_notes")
          .delete()
          .eq("applied_to_bill_id", b.id);
      }
    }
    await supabase.from("bills").delete().eq("customer_id", c.id);
    await supabase.from("pause_periods").delete().eq("customer_id", c.id);
    await supabase.from("customers").delete().eq("id", c.id);
  }
}

// Helper: delete every row the lifecycle test created. Order matters per FK
// cascade rules in schema.sql:
//   payments ON DELETE CASCADE on bill
//   daily_logs customer_id FK ON DELETE CASCADE on customer
//   subscriptions customer_id FK -> customer
//   bills customer_id FK ON DELETE CASCADE on customer
// We delete in safest-leaf-first order to be explicit and avoid relying on
// cascade behaviour even though it is documented.
async function cleanupAll(supabase, { customerId, billId }) {
  // Payments on the bill.
  await supabase.from("payments").delete().eq("bill_id", billId);
  // Adjustments & credit notes linked to the bill.
  await supabase.from("adjustments").delete().eq("bill_id", billId);
  await supabase
    .from("credit_notes")
    .delete()
    .or(
      `bill_id.eq.${billId},applied_to_bill_id.eq.${billId},customer_id.eq.${customerId}`,
    );
  // Daily logs for the customer (today).
  await supabase.from("daily_logs").delete().eq("customer_id", customerId);
  // Subscriptions for the customer (if any created).
  await supabase.from("subscriptions").delete().eq("customer_id", customerId);
  // Bills for the customer.
  await supabase.from("bills").delete().eq("customer_id", customerId);
  // Pauses (in case any left over).
  await supabase.from("pause_periods").delete().eq("customer_id", customerId);
  // Finally the customer itself — cascades to FK-dependent rows too.
  await supabase.from("customers").delete().eq("id", customerId);
}

function num(v) {
  const n = Number(v);
  return isNaN(n) ? 0 : n;
}
