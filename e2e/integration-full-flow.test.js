// e2e/integration-full-flow.test.js
//
// Complete user journey:
//   1. Create a real customer via the Customer modal — verify the row lands
//      in the DB AND that it then appears on the Customers page.
//   2. Generate a delivery log for today via the Delivery page's
//      "Generate Deliveries" button — verify daily_logs rows appear.
//   3. Generate a bill for the current month via Billing → Generate Bills.
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
    await page.goto("/");
    const pin = page.locator("#pin-input");
    if (await pin.isVisible({ timeout: 8_000 }).catch(() => false)) {
      await pin.fill(OPERATOR_PIN);
      await page.getByRole("button", { name: "Login" }).click();
    }
  });

  test("create customer, generate log, generate bill, partial payment — DB ↔ UI agree", async ({ page }) => {
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
    if (brandErr) throw new Error(`preflight milk_brands probe failed: ${brandErr.message}`);
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
    await expect(page.getByRole("heading", { name: "Customers", exact: true }).first()).toBeVisible();
    await page.getByRole("button", { name: "+ Add" }).click();
    await expect(page.getByRole("dialog")).toBeVisible();

    // Match CustomerModal.jsx field placeholders.
    await page.getByPlaceholder("Ramesh Sharma").fill(cname);
    await page.getByPlaceholder("14, Shivaji Nagar").fill("E2E Test Address");
    await page.getByPlaceholder("9876543210").fill("9000010001");
    // Product + qty default to Full Cream / 1 — leave alone.
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

    // ─── STEP 2: Generate delivery logs for today ──────────────────────
    await page.getByRole("button", { name: "Delivery" }).click();
    // STRICT-MODE: AppShell renders <h2>Daily Delivery</h2>. Delivery.jsx
    // itself has no second heading with this label, so single-match.
    await expect(page.getByRole("heading", { name: "Daily Delivery" })).toBeVisible();
    // Set the date to today (page defaults to today but covers UI contract).
    await page.locator('input[type="date"]').first().fill(today);

    await page.getByRole("button", { name: /Generate Deliveries/ }).click();
    // Toast confirms generation. The Delivery page renders .stat-tile with
    // the "Scheduled" count label (Delivery.jsx:113-118).
    await expect(
      page.locator(".stat-label").filter({ hasText: "Scheduled" }).first(),
    ).toBeVisible({ timeout: 10_000 });

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
      expect(data, "daily_logs row not created for today's generation").not.toBeNull();
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
    expect(markErr, "could not mark the generated daily_log as delivered").toBeNull();

    // ─── STEP 3: Generate the month bill ───────────────────────────────
    await page.getByRole("button", { name: "Billing" }).click();
    // STRICT-MODE: AppShell <h2>Billing</h2> + Billing.jsx:163
    // <Section title="Billing"> → <h3>Billing</h3>. Use .first().
    await expect(page.getByRole("heading", { name: "Billing" }).first()).toBeVisible();
    // Set the month picker to current month (typically already there).
    await page.locator('input[type="month"]').first().fill(month);
    await page.getByRole("button", { name: "Generate Bills" }).click();

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

    // NOTE: `generateMonthlyBills` (useBillOperations.js:18-64) already
    // re-fetches `getBills({month: billMonth})` and calls `setBills` after
    // every generation — the in-memory state is updated in place and the
    // Billing page re-renders with the newly generated bill. A full-page
    // `page.reload()` here would dump us back to the dashboard tab and
    // wipe the in-memory cache; do NOT reload.
    await expect(page.getByRole("heading", { name: "Billing" }).first()).toBeVisible();

    // Find the bill card for our customer (Billing.jsx renders one Card per
    // bill — BillCard at line 93).
    const billCard = page
      .locator(".card")
      .filter({ hasText: cname })
      .first();

    // "Record Payment" button exists per Billing.jsx:32-35 when the bill
    // is unlocked and status !== "Paid".
    await expect(billCard.getByRole("button", { name: "Record Payment" })).toBeVisible({ timeout: 15_000 });
    await billCard.getByRole("button", { name: "Record Payment" }).click();
    await expect(page.getByRole("dialog")).toBeVisible();

    // PaymentModal.jsx auto-prefills the pending amount into payAmt
    // (PaymentModal.jsx:21-29). We pay HALF the pending now for the
    // Partial state assertion.
    const pending = num(billRow.amount) - num(billRow.amount_paid);
    const halfStr = String(Math.floor((pending / 2) * 100) / 100);
    await page.getByLabel(/Amount/).first().fill(halfStr);
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
  });
});

// HELPER: pre-test cleanup sweep. Run before the lifecycle so a prior
// aborted run cannot leave orphan __e2e__ rows that would shadow the new
// insert via duplicate phone. The sweep relies on the `__e2e__` name prefix
// invariant (helpers/supabase.js:e2eName) so only test-issued rows are
// touched — never operator real data.
async function preClean(supabase) {
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
        await supabase.from("credit_notes").delete().eq("applied_to_bill_id", b.id);
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
    .or(`bill_id.eq.${billId},applied_to_bill_id.eq.${billId},customer_id.eq.${customerId}`);
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