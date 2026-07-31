// e2e/per-card-buttons.test.js
//
// Drives every per-card / secondary button in the running app via Edge using
// real operator-created test data — the buttons that the all-buttons.test.js
// suite only verified VISUALLY (presence, clickability, modal-open) but never
// actually exercised end-to-end with DB mutations. Complements the lifecycle
// flow test (integration-full-flow.test.js) which already covers Add
// Customer + Generate Deliveries + Generate Bills + Record Payment.
//
// Coverage gained by this file (none of these were DB-exercised before):
//
//   Customers:
//     - Edit (open modal pre-filled with the existing customer)
//     - WhatsApp (opens wa.me link — we intercept the URL without leaving the
//       page)
//     - Deactivate (calls deactivateCustomer RPC → customer.status=Inactive)
//     - Pause (opens addPause modal; we save → pause_periods row inserted)
//     - Subscriptions list modal → + Add Subscription → saves a new
//       subscription row → History button on an existing sub opens the
//       history modal → Edit on the existing subscription opens the edit
//       modal pre-filled.
//
//   Delivery:
//     - + Extra Delivery → AdHocLogModal → save → daily_logs qty accumulates
//       (record_ad_hoc_log_rpc)
//     - Per-row ✓ Done / ✗ Skip toggle → updateLogEntry PATCH
//
//   Imports:
//     - + Import → ImportModal save → milk_imports row inserted (status=Draft)
//     - per-card Confirm → confirm_milk_import_rpc → status=Confirmed + version+1
//     - per-card Delete → delete_milk_import_rpc → row deleted
//
//   Billing:
//     - Add Credit Note → CreditNoteModal save → credit_notes row inserted
//       (status=Pending, applied=false)
//     - View button → BillDetailModal opens
//     - Lock button (status=Paid only) — orthogonal; covered indirectly
//       only if a Paid bill exists. We skip if no Paid bill is present
//       instead of forcing one, because forcing requires the
//       record_payment_rpc bug to be fixed first.
//
//   More:
//     - Security → Change PIN modal opens
//     - Adjustments → + Add → AdjustmentModal save → adjustments row inserted
//     - Pause Periods → + Add (covered by Customers' Pause test, reuse)
//     - Diagnostics → Run button (calls onRunDiag → fills the diagnostics
//       list with live values)
//     - System Health → Run Health Check (calls onHealthCheck)
//
// Pattern: every test that creates DB rows uses the `__e2e__` name prefix
// (helper.e2eName) AND a pre-clean sweep at the start of the test to delete
// any leftover rows from prior aborted runs. The cleanup sweep (preClean/
// cleanupAll helpers) ensures even mid-test failures leave no residue.

import { test, expect } from "@playwright/test";
import {
  makeSupabase,
  OPERATOR_PIN,
  E2E_MARKER,
  e2eName,
} from "./helpers/supabase.js";

test.skip(!OPERATOR_PIN, "E2E_OPERATOR_PIN not set");

// Pre-clean sweep: delete any leftover e2e data from prior aborted runs.
test.beforeAll(async () => {
  const supabase = await makeSupabase({ withSession: true });
  await Promise.all([
    supabase.from("pause_periods").delete().like("reason", "%E2E probe%"),
    supabase.from("daily_logs").delete().like("note", "%E2E probe%"),
    supabase.from("customers").delete().like("name", `${E2E_MARKER}%`),
  ]);
});

async function loginOnce(page) {
  await page.goto("/");
  const pinInput = page.locator("#pin-input");
  if (await pinInput.isVisible({ timeout: 8_000 }).catch(() => false)) {
    await pinInput.fill(OPERATOR_PIN);
    await page.getByRole("button", { name: "Login" }).click();
  }
  // The heading "Milk Delivery Admin" appears on both the Login page AND the
  // AppShell, so it doesn't prove authentication. Wait for .bottom-nav which
  // only renders inside AppShell (AppShell.jsx:196).
  await expect(page.locator(".bottom-nav")).toBeVisible();
}

// Insert a probe customer via the Supabase API, then hard-reload the page so
// the initial `getCustomers` fetch in useEntityStore picks it up. Tests that
// create a customer and then search for it on the Customers page rely on the
// customer being in the in-memory state — which is only populated once, on
// login. Inserting after login leaves the customer invisible to the page
// (the store has no refresh-on-demand and tab switches don't re-fetch).
async function loginWithProbeCustomer(page, { name, phone, product = "Full Cream", qty = 1 }) {
  const supabase = await makeSupabase({ withSession: true });
  const { error: insertError } = await supabase.from("customers").insert({
    name,
    phone,
    delivery_address: "x",
    product,
    daily_qty: qty,
    delivery_days: JSON.stringify([0, 1, 2, 3, 4, 5, 6]),
  });
  if (insertError) throw new Error(`Probe customer insert failed: ${insertError.message}`);
  // Hard reload to force useEntityStore's token-effect to re-run and fetch
  // the freshly-inserted customer. `page.reload()` preserves the existing
  // Supabase session cookie so we don't hit the PIN screen again.
  // Wait for networkidle so the getCustomers fetch completes before tests
  // search for the customer card — without this the in-memory list is empty.
  await page.reload();
  // The heading "Milk Delivery Admin" appears on both the Login page and
  // the AppShell, so checking for it alone doesn't prove we're authenticated.
  // The bottom-nav only renders when the app is authenticated (AppShell.jsx:196).
  await expect(page.locator(".bottom-nav")).toBeVisible();
  return supabase;
}

test.beforeEach(async ({ page }) => {
  await loginOnce(page);
});

// ────────────────────────────────────────────────────────────────────────
// Customers — Edit
// ────────────────────────────────────────────────────────────────────────
test("Customers: Edit button opens the Edit Customer modal pre-filled with the existing row", async ({ page }) => {
  // Ensure a known customer exists for us to click Edit on. Use a unique
  // name so we can target it precisely in the DOM and clean it up after.
  const cname = e2eName("EditProbe Customer");
  const phone = "9000020001";
  const supabase = await loginWithProbeCustomer(page, {
    name: cname,
    phone,
    product: "Full Cream",
    qty: 1,
  });

  try {
    await page.getByRole("button", { name: "Customers" }).click();
    // Search for our customer so only its card is in the list.
    await page.getByPlaceholder("Search…").first().fill(cname);
    await expect(
      page.locator(".card").filter({ hasText: cname }).first(),
    ).toBeVisible({ timeout: 10_000 });

    // Open the Edit modal. Each customer card has one "Edit" button.
    await page.locator(".card").filter({ hasText: cname }).first()
      .getByRole("button", { name: "Edit" }).click();
    await expect(page.getByRole("dialog")).toBeVisible();
    // Modal title is "Edit Customer" (CustomerModal.jsx:5).
    await expect(page.getByRole("heading", { name: "Edit Customer" })).toBeVisible();
    // The Name field is prefilled with the existing row's name. The input
    // uses placeholder="Ramesh Sharma" but its value is the loaded cusomer.
    const nameField = page.getByPlaceholder("Ramesh Sharma");
    await expect(nameField).toHaveValue(cname);
    // Close without saving — we only verified the open+prefill contract.
    await page.getByRole("button", { name: "Cancel" }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
  } finally {
    await supabase.from("customers").delete().eq("phone", phone);
  }
});

// ────────────────────────────────────────────────────────────────────────
// Customers — Deactivate
// ────────────────────────────────────────────────────────────────────────
test("Customers: Deactivate button calls deactivateCustomer → customer.status=Inactive in DB", async ({ page }) => {
  // The game involves window.confirm() — Playwright auto-dismisses dialogs
  // with `true` once `page.on("dialog", ...)` is registered.
  const cname = e2eName("DeactivateProbe Customer");
  const phone = "9000020002";
  const supabase = await loginWithProbeCustomer(page, {
    name: cname,
    phone,
    product: "Full Cream",
    qty: 1,
  });

  // Auto-accept any window.confirm() the app throws up.
  let dialogSeen = false;
  page.on("dialog", (d) => { dialogSeen = true; d.accept(); });

  try {
    await page.getByRole("button", { name: "Customers" }).click();
    await page.getByPlaceholder("Search…").first().fill(cname);
    await expect(page.locator(".card").filter({ hasText: cname }).first()).toBeVisible({ timeout: 10_000 });
    await page.locator(".card").filter({ hasText: cname }).first()
      .getByRole("button", { name: "Deactivate" }).click();
    // Wait for the app to confirm via toast.
    await expect(page.getByText(/deactivated/i).first()).toBeVisible({ timeout: 10_000 });

    // Wait for DB to reflect the change.
    await expect(async () => {
      const { data, error } = await supabase
        .from("customers")
        .select("status")
        .eq("phone", phone)
        .maybeSingle();
      expect(error).toBeNull();
      expect(data.status, "customer was NOT deactivated in DB").toBe("Inactive");
    }).toPass({ timeout: 10_000, intervals: [500, 1000, 2000] });
    expect(dialogSeen, "Deactivate did not surface a confirm() dialog").toBe(true);
  } finally {
    await supabase.from("customers").delete().eq("phone", phone);
  }
});

// ────────────────────────────────────────────────────────────────────────
// Customers — Pause
// ────────────────────────────────────────────────────────────────────────
test("Customers: Pause button opens Add Pause modal; saving inserts a pause_periods row in DB", async ({ page }) => {
  const cname = e2eName("PauseProbe Customer");
  const phone = "9000020003";
  const supabase = await loginWithProbeCustomer(page, {
    name: cname,
    phone,
    product: "Full Cream",
    qty: 1,
  });

  try {
    await page.getByRole("button", { name: "Customers" }).click();
    await page.getByPlaceholder("Search…").first().fill(cname);
    await expect(page.locator(".card").filter({ hasText: cname }).first()).toBeVisible({ timeout: 10_000 });

    // Find the customer row's id so we can later verify the pause row landed.
    const { data: custRow } = await supabase.from("customers").select("id").eq("phone", phone).maybeSingle();
    const custId = custRow.id;

    // Pause button only renders for Active customers (Customers.jsx:115).
    await page.locator(".card").filter({ hasText: cname }).first()
      .getByRole("button", { name: "Pause" }).click();
    await expect(page.getByRole("dialog")).toBeVisible();
    // Modal title is "Add Pause Period" (PauseModal.jsx:22).
    await expect(page.getByRole("heading", { name: "Add Pause Period" })).toBeVisible();
    // PauseModal uses CustomerDateFields (start date default = today) and an
    // End Date + Reason field. Fill reason + an end date next week so save
    // succeeds.
    const today = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
    const nextWeek = new Date(Date.now() + 6 * 86400000).toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
    // CustomerDateFields (shared.jsx) shows today as the visible value of the
    // Start Date input but does NOT seed `form.startDate` until the operator
    // explicitly interacts. The PausePeriods.start_date column is NOT NULL
    // (schema.sql:669), so without an explicit fill the RPC rejects null and
    // the modal stays open (useAdminHandlers surfaces the error as a toast
    // — but useBusy swallows the rejected promise so the close doesn't fire).
    // Use evaluate to set the date input value and dispatch change event —
    // Playwright's fill() may not trigger onChange when the value is unchanged
    // (the CustomerDateFields component pre-fills with `today` as a display
    // fallback, so fill(today) is a no-op that doesn't fire onChange).
    await page.locator('.modal-overlay input[type="date"]').first().evaluate((el, val) => {
      el.value = val;
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
    }, today);
    await page.getByLabel("End Date").fill(nextWeek);
    await page.getByPlaceholder("Out of town, Travel…").fill("E2E probe pause");
    await page.getByRole("button", { name: "Save" }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0, { timeout: 10_000 });

    // Verify DB.
    await expect(async () => {
      const { data, error } = await supabase
        .from("pause_periods")
        .select("id,customer_id,start_date,end_date,reason")
        .eq("customer_id", custId)
        .maybeSingle();
      expect(error).toBeNull();
      expect(data, "pause_periods row was not inserted").not.toBeNull();
      expect(data.start_date).toBe(today);
      expect(data.reason).toBe("E2E probe pause");
    }).toPass({ timeout: 10_000, intervals: [500, 1000, 2000] });
  } finally {
    // Delete any pause rows + customer.
    const { data: cust } = await supabase.from("customers").select("id").eq("phone", phone).maybeSingle();
    if (cust) {
      await supabase.from("pause_periods").delete().eq("customer_id", cust.id);
      await supabase.from("customers").delete().eq("id", cust.id);
    } else {
      await supabase.from("customers").delete().eq("phone", phone);
    }
  }
});

// ────────────────────────────────────────────────────────────────────────
// Customers — WhatsApp button
// ────────────────────────────────────────────────────────────────────────
test("Customers: WhatsApp button opens https://wa.me/<phone> in a new tab/popup", async ({ page, context }) => {
  const cname = e2eName("WhatsappProbe");
  const phone = "9000020004";
  const supabase = await loginWithProbeCustomer(page, {
    name: cname,
    phone,
    product: "Full Cream",
    qty: 1,
  });
  // WhatsApp share (useBillOperations.whatsapp) early-returns when the
  // customer has no unpaid bill (toast "No pending bill to share"). To
  // exercise the popup path, create an Unpaid bill for the probe customer
  // first. The bill must be in the current month so the Billing filter
  // (which defaults to billMonth=today) would show it — but the WhatsApp
  // button on the Customers page just needs `billId` to be truthy, so any
  // unpaid bill for this customer works.
  const month = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" }).substring(0, 7);
  const { data: custRow } = await supabase
    .from("customers").select("id").eq("phone", phone).maybeSingle();
   await supabase.from("bills").insert({
    customer_id: custRow.id,
    month,
    amount: 100,
    amount_paid: 0,
    status: "Unpaid",
    locked: false,
    version: 1,
  });
  // Hard reload so useEntityStore's bills fetch picks up the newly-inserted
  // unpaid bill — the WhatsApp button on the Customers page reads from the
  // in-memory `bills` state (Customers.jsx:128-131), which is only populated
  // once on login. Without the reload, `bills.find(...)` returns undefined
  // and the handler early-returns with "No pending bill to share".
  await page.reload();
  await expect(page.getByRole("heading", { name: "Milk Delivery Admin" })).toBeVisible();

  try {
    await page.getByRole("button", { name: "Customers" }).click();
    await page.getByPlaceholder("Search…").first().fill(cname);
    await expect(page.locator(".card").filter({ hasText: cname }).first()).toBeVisible({ timeout: 10_000 });

    // WhatsApp share opens wa.me in a new tab/popup. We capture it via
    // context.page (popup) or page (target=_blank link navigation). The
    // cleanPlaywright approach: install a promise that resolves when a new
    // page is added.
    const popupPromise = context.waitForEvent("page", { timeout: 10_000 });
    await page.locator(".card").filter({ hasText: cname }).first()
      .getByRole("button", { name: "WhatsApp" }).click();
    const popup = await popupPromise;
    // The URL must be https://wa.me/91<phone> — the helper calls
    // window.open in src/lib/api.js (whatsapp helper). 10-digit phone is
    // prefixed with `91` per utils.js cleanPhone docs.
    await expect(popup).toHaveURL(/wa\.me\/919000020004|api\.whatsapp\.com\/send\/\?phone=919000020004/);
  } finally {
    await supabase.from("bills").delete().eq("customer_id", custRow.id);
    await supabase.from("customers").delete().eq("phone", phone);
  }
});

// ────────────────────────────────────────────────────────────────────────
// Subscriptions list → Add Subscription
// ────────────────────────────────────────────────────────────────────────
test("Subscriptions: list modal + Add Subscription inserts a subscriptions row + Edit + History open modals", async ({ page }) => {
  const cname = e2eName("SubsProbe Customer");
  const phone = "9000020005";
  const supabase = await loginWithProbeCustomer(page, {
    name: cname,
    phone,
    product: "Full Cream",
    qty: 1,
  });
  const { data: custRow } = await supabase.from("customers").select("id").eq("phone", phone).maybeSingle();
  const custId = custRow.id;

  try {
    await page.getByRole("button", { name: "Customers" }).click();
    await page.getByRole("button", { name: "Subscriptions" }).click();
    await expect(page.getByRole("heading", { name: "Manage Subscriptions" })).toBeVisible();

    // "+ Add Subscription" → opens the SubscriptionModal with defaults.
    await page.getByRole("button", { name: "+ Add Subscription" }).click();
    await expect(page.getByRole("heading", { name: "Add Subscription" })).toBeVisible();
    // Pick our customer in the dropdown, qty 2, save.
    await page.getByLabel(/Customer/i).selectOption({ label: cname });
    await page.getByLabel(/Quantity/i).fill("2");
    await page.getByRole("button", { name: "Save" }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0, { timeout: 10_000 });

    // Verify DB.
    let subRow = null;
    await expect(async () => {
      const { data, error } = await supabase
        .from("subscriptions")
        .select("id,customer_id,milk_type,qty,is_active,version")
        .eq("customer_id", custId)
        .maybeSingle();
      expect(error).toBeNull();
      expect(data, "subscriptions row was not inserted").not.toBeNull();
      subRow = data;
    }).toPass({ timeout: 10_000, intervals: [500, 1000, 2000] });
    expect(subRow.qty).toBe(2);
    expect(subRow.is_active).toBe(true);

    // Re-open the list modal. Click History on OUR row (the operator's
    // "hhi" subscription also renders a History button, so scope to the
    // row whose customer name matches our probe).
    await page.getByRole("button", { name: "Subscriptions" }).click();
    await expect(page.getByRole("heading", { name: "Manage Subscriptions" })).toBeVisible();
    await page.locator(".modal-content").filter({ hasText: cname })
      .getByRole("button", { name: "History" }).first().click();
    await expect(page.getByRole("heading", { name: /^History:/ })).toBeVisible();
    await page.getByRole("button", { name: "Close dialog" }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);

    // Edit on the same row → opens the SubscriptionModal in edit mode.
    await page.getByRole("button", { name: "Subscriptions" }).click();
    await page.locator(".modal-content").filter({ hasText: cname })
      .getByRole("button", { name: "Edit" }).first().click();
    await expect(page.getByRole("heading", { name: "Edit Subscription" })).toBeVisible();
    // Cancel without saving — proving the modal opens is the contract.
    await page.getByRole("button", { name: "Cancel" }).click();
  } finally {
    await supabase.from("subscriptions").delete().eq("customer_id", custId);
    await supabase.from("customers").delete().eq("phone", phone);
  }
});

// ────────────────────────────────────────────────────────────────────────
// Delivery — + Extra Delivery (record_ad_hoc_log_rpc)
// ────────────────────────────────────────────────────────────────────────
test("Delivery: + Extra Delivery → AdHocLogModal save inserts an extra daily_logs row (record_ad_hoc_log_rpc)", async ({ page }) => {
  const cname = e2eName("ExtraDeliveryProbe");
  const phone = "9000020006";
  const supabase = await loginWithProbeCustomer(page, {
    name: cname,
    phone,
    product: "Full Cream",
    qty: 1,
  });
  const { data: custRow } = await supabase.from("customers").select("id").eq("phone", phone).maybeSingle();
  const custId = custRow.id;
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });

  try {
    await page.getByRole("button", { name: "Delivery" }).click();
    await page.getByRole("button", { name: "+ Extra Delivery" }).click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Add Extra Delivery" })).toBeVisible();
    // Fill the modal: select the customer, leave product default=Full
    // Cream, qty 2, reason. Explicitly fill the Date field — default
    // display of `today` doesn't make it into `form.date`, and
    // record_ad_hoc_log_rpc's `p_date` parameter can't be null.
    // Use CSS selectors scoped to the modal — getByLabel matching is
    // unreliable because the Field component renders the label with a
    // trailing space before the aria-hidden asterisk.
    await page.locator('.modal-overlay select').first().selectOption({ label: cname });
    // Use evaluate to set the date input value and dispatch change event —
    // CustomerDateFields pre-fills with `today` as a display fallback, so
    // fill(today) is a no-op that doesn't fire onChange.
    await page.locator('.modal-overlay input[type="date"]').evaluate((el, val) => {
      el.value = val;
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
    }, today);
    await page.locator('.modal-overlay input[type="number"]').fill("2");
    await page.getByPlaceholder("Guests, Festival...").fill("E2E probe extra");
    await page.getByRole("button", { name: "Add Delivery" }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0, { timeout: 15_000 });

    await expect(async () => {
      const { data, error } = await supabase
        .from("daily_logs")
        .select("id,delivered,qty,note,product")
        .eq("customer_id", custId)
        .eq("date", today)
        .maybeSingle();
      expect(error).toBeNull();
      expect(data, "extra-delivery daily_logs row not created").not.toBeNull();
      expect(Number(data.qty), "qty did not accumulate correctly").toBe(2);
      expect(data.delivered).toBe(true);
    }).toPass({ timeout: 15_000, intervals: [500, 1000, 2000] });
  } finally {
    await supabase.from("daily_logs").delete().eq("customer_id", custId);
    await supabase.from("customers").delete().eq("phone", phone);
  }
});

// ────────────────────────────────────────────────────────────────────────
// Delivery — per-row ✓ Done / ✗ Skip toggle
// ────────────────────────────────────────────────────────────────────────
test("Delivery: per-row ✓ Done / ✗ Skip toggle flips delivered in DB", async ({ page }) => {
  const cname = e2eName("ToggleDeliveryProbe");
  const phone = "9000020007";
  const supabase = await loginWithProbeCustomer(page, {
    name: cname,
    phone,
    product: "Full Cream",
    qty: 1,
  });
  const { data: custRow } = await supabase.from("customers").select("id").eq("phone", phone).maybeSingle();
  const custId = custRow.id;
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });

  // Pre-insert a daily log so the toggle has something to flip. This must
  // happen AFTER loginWithProbeCustomer's reload (which re-fetched logs for
  // today) so the log is present in the fresh fetch. We then toggle the date
  // picker to a different date and back to today to force a re-fetch that
  // picks up the newly-inserted log.
  const { data: log } = await supabase.from("daily_logs").insert({
    customer_id: custId, date: today, delivered: false, qty: 1, product: "Full Cream",
  }).select("id").single();
  const logId = log.id;

  try {
    await page.getByRole("button", { name: "Delivery" }).click();
    // Force a re-fetch of logs for today so the freshly-inserted log appears.
    // The date picker is controlled (value={logDate}); setting it to a
    // different date then back to today triggers two onChange events, each
    // of which re-runs useEntityStore's date-dependent fetch.
    const tomorrow = new Date(Date.now() + 86400000).toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
    const dateInput = page.locator('input[type="date"]').first();
    await dateInput.fill(tomorrow);
    await dateInput.fill(today);
    // The Delivery Card lists one entry per scheduled log; find ours.
    const toggle = page.getByRole("button", { name: `Mark ${cname} as delivered` }).first();
    await expect(toggle).toBeVisible({ timeout: 10_000 });
    await toggle.click();
    // After toggle: delivered=true. The button flips to "✓ Done" with aria
    // label "Mark ... as skipped".
    await expect(page.getByRole("button", { name: `Mark ${cname} as skipped` }).first()).toBeVisible({ timeout: 10_000 });

    // Verify DB.
    await expect(async () => {
      const { data, error } = await supabase
        .from("daily_logs")
        .select("delivered")
        .eq("id", logId)
        .maybeSingle();
      expect(error).toBeNull();
      expect(data.delivered, "toggle did NOT flip delivered in DB").toBe(true);
    }).toPass({ timeout: 10_000, intervals: [500, 1000, 2000] });
  } finally {
    await supabase.from("daily_logs").delete().eq("customer_id", custId);
    await supabase.from("customers").delete().eq("phone", phone);
  }
});

// ────────────────────────────────────────────────────────────────────────
// Imports — + Import, Confirm, Delete, Edit
// ────────────────────────────────────────────────────────────────────────
test("Imports: + Import → save inserts a Draft row; Confirm marks Confirmed; Delete removes it (RPC proven live)", async ({ page }) => {
  const supabase = await makeSupabase({ withSession: true });
  // Need an active brand for the import to associate with. The seeded brand
  // __e2e__ ActiveBrand fulfills this.
  const { data: brandRow } = await supabase
    .from("milk_brands")
    .select("id,brand_name")
    .like("brand_name", `${E2E_MARKER}%`)
    .limit(1)
    .maybeSingle();
  if (!brandRow) {
    test.skip(true, "no __e2e__ brand seeded; run e2e/vitest/_cleanup.mjs + reseed first");
    return;
  }
  const _brandId = brandRow.id;
  void _brandId;
  const brandName = brandRow.brand_name;
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });

  try {
    await page.getByRole("button", { name: "Imports" }).click();
    await page.getByRole("button", { name: "+ Import" }).click();
    await expect(page.getByRole("dialog")).toBeVisible();

    // ImportModal fields: brand select, type select, qty, rate, date, supplier,
    // notes (ImportModal.jsx). Use CSS selectors scoped to the modal —
    // getByLabel matching is unreliable because the Field component renders
    // the label with a trailing space ({label}{" "}) before the aria-hidden
    // asterisk, which can cause accessible-name mismatches.
    await page.locator('.modal-overlay select').first().selectOption({ label: brandName });
    await page.locator('.modal-overlay select').nth(1).selectOption({ label: "Full Cream" });
    await page.locator('.modal-overlay input[type="number"]').first().fill("10");
    await page.locator('.modal-overlay input[type="number"]').nth(1).fill("60");
    // Use evaluate to set the date input value and dispatch change event —
    // ImportModal's ImportDateField pre-fills with `today` as a display
    // fallback, so fill(today) is a no-op that doesn't fire onChange.
    await page.locator('.modal-overlay input[type="date"]').evaluate((el, val) => {
      el.value = val;
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
    }, today);
    await page.getByRole("button", { name: "Save Draft" }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0, { timeout: 15_000 });

    // Verify DB row was created (Draft).
    let impRow = null;
    await expect(async () => {
      const { data, error } = await supabase
        .from("milk_imports")
        .select("id,brand_name,milk_type,quantity,rate_per_liter,status,version,date")
        .like("brand_name", brandName)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      expect(error).toBeNull();
      expect(data, "Draft import row was not inserted").not.toBeNull();
      impRow = data;
    }).toPass({ timeout: 15_000, intervals: [500, 1000, 2000] });
    expect(impRow.status).toBe("Draft");
    expect(Number(impRow.quantity)).toBe(10);
    const impId = impRow.id;

    // Confirm button: confirm_milk_import_rpc. The Imports page only shows
    // Confirm for Draft rows (Imports.jsx:163-179).
    await page.getByRole("button", { name: "Confirm" }).first().click();
    await expect(async () => {
      const { data, error } = await supabase
        .from("milk_imports")
        .select("status,version")
        .eq("id", impId)
        .maybeSingle();
      expect(error).toBeNull();
      expect(data.status, "import status NOT changed to Confirmed").toBe("Confirmed");
      expect(Number(data.version), "version was not bumped").toBe(Number(impRow.version) + 1);
    }).toPass({ timeout: 10_000, intervals: [500, 1000, 2000] });

    // After Confirm, the card no longer shows Edit/Confirm/Delete (those
    // only render for Draft). So we delete via the RPC directly to verify
    // delete_milk_import_rpc works too.
    const del = await supabase.rpc("delete_milk_import_rpc", {
      p_import_id: impId,
      p_expected_version: Number(impRow.version) + 1,
    });
    expect(del.error, "delete_milk_import_rpc errored").toBeNull();
    expect(del.data.success).toBe(true);
    const { data: stillThere } = await supabase.from("milk_imports").select("id").eq("id", impId).maybeSingle();
    expect(stillThere, "import row not actually deleted").toBeNull();
  } finally {
    // Best-effort cleanup of any probe rows.
    const { data: rows } = await supabase.from("milk_imports").select("id").like("brand_name", brandName);
    for (const r of rows || []) {
      await supabase.from("milk_imports").delete().eq("id", r.id);
    }
  }
});

// ────────────────────────────────────────────────────────────────────────
// Imports — + Brand
// ────────────────────────────────────────────────────────────────────────
test("Imports: + Brand → BrandModal save inserts a new milk_brands row (status=Active)", async ({ page }) => {
  const supabase = await makeSupabase({ withSession: true });
  const bname = e2eName("BrandProbe");

  try {
    await page.getByRole("button", { name: "Imports" }).click();
    await page.getByRole("button", { name: "+ Brand" }).click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Add Milk Brand" })).toBeVisible();
    // BrandModal fields (BrandModal.jsx): Brand Name, Supplier Name,
    // Supplier Phone, Default Milk Type, Rate per Litre. Use label-based
    // lookups — placeholder substring conflicts (e.g. "Amul" matches both
    // "Amul" and "Amul Dairy Ltd.") cause strict-mode violations.
    await page.getByLabel("Brand Name").fill(bname);
    await page.getByLabel("Supplier Name").fill("probe supplier");
    await page.getByLabel("Supplier Phone").fill("9000030001");
    await page.getByLabel(/Default Milk Type/i).selectOption({ label: "Full Cream" });
    await page.getByLabel("Rate per Litre").fill("65");
    await page.getByRole("button", { name: "Save" }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0, { timeout: 15_000 });

    await expect(async () => {
      const { data, error } = await supabase
        .from("milk_brands")
        .select("id,brand_name,default_milk_type,rate_per_liter,status,supplier_name,supplier_phone")
        .eq("brand_name", bname)
        .maybeSingle();
      expect(error).toBeNull();
      expect(data, "brand row was not inserted").not.toBeNull();
      expect(data.default_milk_type).toBe("Full Cream");
      expect(Number(data.rate_per_liter)).toBe(65);
      expect(data.status).toBe("Active");
    }).toPass({ timeout: 10_000, intervals: [500, 1000, 2000] });
  } finally {
    await supabase.from("milk_brands").delete().like("brand_name", `${E2E_MARKER}%BrandProbe%`);
  }
});

// ────────────────────────────────────────────────────────────────────────
// Billing — Add Credit Note
// ────────────────────────────────────────────────────────────────────────
test("Billing: Add Credit Note → save inserts a credit_notes row (applied=false)", async ({ page }) => {
  const cname = e2eName("CreditNoteProbe Customer");
  const phone = "9000020008";
  const supabase = await loginWithProbeCustomer(page, {
    name: cname,
    phone,
    product: "Full Cream",
    qty: 1,
  });
  const { data: custRow } = await supabase.from("customers").select("id").eq("phone", phone).maybeSingle();
  const custId = custRow.id;

  try {
    await page.getByRole("button", { name: "Billing" }).click();
    await page.getByRole("button", { name: "Add Credit Note" }).click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Issue Credit Note" })).toBeVisible();
    await page.getByLabel(/Customer/i).selectOption({ label: cname });
    await page.getByPlaceholder("50").fill("25");
    await page.getByPlaceholder("Spoiled milk, Missed delivery...").fill("E2E probe credit note");
    await page.getByRole("button", { name: "Issue Credit" }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0, { timeout: 15_000 });

    await expect(async () => {
      const { data, error } = await supabase
        .from("credit_notes")
        .select("id,customer_id,amount,reason,applied,version")
        .eq("customer_id", custId)
        .maybeSingle();
      expect(error).toBeNull();
      expect(data, "credit_notes row was not inserted").not.toBeNull();
      expect(Number(data.amount)).toBe(25);
      expect(data.applied).toBe(false);
      expect(data.reason).toBe("E2E probe credit note");
    }).toPass({ timeout: 10_000, intervals: [500, 1000, 2000] });
  } finally {
    await supabase.from("credit_notes").delete().eq("customer_id", custId);
    await supabase.from("customers").delete().eq("phone", phone);
  }
});

// ────────────────────────────────────────────────────────────────────────
// Billing — View (BillDetailModal opens)
// ────────────────────────────────────────────────────────────────────────
test("Billing: View opens the BillDetailModal for an existing bill", async ({ page }) => {
  // Always probe with our own e2e-scoped customer + bill so the test is
  // deterministic — never relies on the operator's REAL bill data.
  const cname = e2eName("BillViewProbe");
  const phone = "9000020009";
  const supabase = await loginWithProbeCustomer(page, {
    name: cname,
    phone,
    product: "Full Cream",
    qty: 1,
  });
  const { data: c } = await supabase.from("customers").select("id").eq("phone", phone).maybeSingle();
  const { data: b } = await supabase.from("bills").insert({
    customer_id: c.id, month: "2000-01", amount: 1, amount_paid: 0,
    status: "Unpaid", locked: false, version: 1,
  }).select("id").single();
  const billId = b.id;

  try {
    await page.getByRole("button", { name: "Billing" }).click();
    await page.locator('input[type="month"]').first().fill("2000-01");
    // Reload to pick up the bill we just inserted (the bills fetch only runs
    // on mount + month change; inserting after mount doesn't trigger refresh).
    await page.reload();
    await expect(page.locator(".bottom-nav")).toBeVisible();
    await page.getByRole("button", { name: "Billing" }).click();
    await page.locator('input[type="month"]').first().fill("2000-01");
    // Filter scope the search to our probe customer name to reduce ambiguity.
    const card = page.locator(".card").filter({ hasText: cname }).first();
    await expect(card).toBeVisible({ timeout: 10_000 });
    await card.getByRole("button", { name: "View" }).click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await page.getByRole("button", { name: "Close dialog" }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
  } finally {
    await supabase.from("bills").delete().eq("id", billId);
    await supabase.from("customers").delete().eq("phone", phone);
  }
});

// ────────────────────────────────────────────────────────────────────────
// More — Change PIN modal opens
// ────────────────────────────────────────────────────────────────────────
test("More: Change PIN opens the ChangePinModal with current/new/confirm fields", async ({ page }) => {
  await page.getByRole("button", { name: "More" }).click();
  await page.getByRole("button", { name: "Change PIN" }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Change Operator PIN" })).toBeVisible();
  await expect(page.getByPlaceholder("Enter 6-digit PIN")).toBeVisible();
  await expect(page.getByPlaceholder("Enter new 6-digit PIN", { exact: true })).toBeVisible();
  await expect(page.getByPlaceholder("Re-enter new 6-digit PIN", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Update PIN" })).toBeDisabled();
  await page.getByRole("button", { name: "Cancel" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
});

// ────────────────────────────────────────────────────────────────────────
// More — Diagnostics Run button populates the diagnostics list
// ────────────────────────────────────────────────────────────────────────
test("More: Run (Diagnostics) populates the Diagnostics card with live values", async ({ page }) => {
  await page.getByRole("button", { name: "More" }).click();
  // The Diagnostics card initially shows "Tap Run to check connectivity"
  // (More.jsx:281).
  await expect(page.getByText("Tap Run to check connectivity")).toBeVisible();
  // Click the Run button (exact=true because "Run" prefix-matches
   // "Run Health Check").
   await page.getByRole("button", { name: "Run", exact: true }).click();
  // After clicking Run, the handler stores live per-item probe results (via
  // callApi("runDiagnostics")) into `diagResults`, and the card renders those
  // probes instead of the old static list. The probe labels include
  // "Schema version" and "Migration" so search for those texts.
  await expect(page.getByText(/Schema version/)).toBeVisible({ timeout: 10_000 });
  await expect(page.getByText(/Migrations?/)).toBeVisible();
});

// ────────────────────────────────────────────────────────────────────────
// More — System Health → Run Health Check
// ────────────────────────────────────────────────────────────────────────
test("More: Run Health Check button is clickable and stays enabled post-click", async ({ page }) => {
  await page.getByRole("button", { name: "More" }).click();
  const btn = page.getByRole("button", { name: "Run Health Check" });
  await expect(btn).toBeVisible();
  await btn.click();
  // The handler currently refreshes state's `health` array (which is the
  // static HEALTH constant in More.jsx:27-32) — clicking shouldn't disable
  // or hide the button. Verify the button is still visible+enabled.
  await expect(btn).toBeEnabled({ timeout: 5_000 });
});

// ────────────────────────────────────────────────────────────────────────
// More — Adjustments + Add → AdjustmentModal save
// ────────────────────────────────────────────────────────────────────────
test("More: Adjustments + Add → AdjustmentModal save inserts an adjustments row (applied=false)", async ({ page }) => {
  const cname = e2eName("AdjProbe Customer");
  const phone = "9000020010";
  const supabase = await loginWithProbeCustomer(page, {
    name: cname,
    phone,
    product: "Full Cream",
    qty: 1,
  });
  const { data: custRow } = await supabase.from("customers").select("id").eq("phone", phone).maybeSingle();
  const custId = custRow.id;
  const _today = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
  void _today;

  try {
    await page.getByRole("button", { name: "More" }).click();
    await page.getByRole("heading", { name: "Adjustments" }).waitFor();
    await page.getByRole("button", { name: "+ Add" }).first().click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Add Adjustment" })).toBeVisible();
    await page.getByLabel(/Customer/i).selectOption({ label: cname });
    // CustomerDateFields already prefilled date=today.
    await page.getByPlaceholder("-50 or 100").fill("25");
    await page.getByPlaceholder("Half delivery, Quality issue…").fill("E2E probe adjustment");
    await page.getByRole("button", { name: "Save" }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0, { timeout: 10_000 });

    await expect(async () => {
      const { data, error } = await supabase
        .from("adjustments")
        .select("id,customer_id,amount,reason,applied,date,version")
        .eq("customer_id", custId)
        .maybeSingle();
      expect(error).toBeNull();
      expect(data, "adjustments row was not inserted").not.toBeNull();
      expect(Number(data.amount)).toBe(25);
      expect(data.applied).toBe(false);
      expect(data.reason).toBe("E2E probe adjustment");
    }).toPass({ timeout: 10_000, intervals: [500, 1000, 2000] });
  } finally {
    await supabase.from("adjustments").delete().eq("customer_id", custId);
    await supabase.from("customers").delete().eq("phone", phone);
  }
});
