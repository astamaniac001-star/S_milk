// e2e/all-buttons.test.js
//
// Drives the running app via Edge. Matches the REAL DOM of this app (not a
// generic template):
//   - Login form uses a single `#pin-input` password field (login.jsx),
//     submit button text is "Login" while resting.
//   - The shell header is `<h1>Milk Delivery Admin</h1>`.
//   - The bottom nav has text-only buttons: Home / Customers / Delivery /
//     Imports / Billing / More.
//   - Pages render Card lists, NOT <table>. We assert on `.card` and text
//     content, matching the actual UI the operator sees.
//
// SELF-SKIPS when E2E_OPERATOR_PIN is unset so the file is a no-op on
// checkouts that haven't provisioned operator credentials.

import { test, expect } from "@playwright/test";
import { OPERATOR_PIN } from "./helpers/supabase.js";
import { waitForAppReady } from "./helpers/app.js";

// Collection-time conditional skip: skip EVERY test in this file when the
// operator PIN isn't configured. Doing this at module scope means Playwright
// never even creates the browser fixture for these tests, which sidesteps
// Edge-launch / video-recording failures we'd otherwise see when running
// the suite on a host that lacks `E2E_OPERATOR_PIN`.
test.skip(!OPERATOR_PIN, "E2E_OPERATOR_PIN not set");

// Login once and stash cookies/localStorage so every test re-enters the
// authenticated app without re-typing the PIN. Supabase persists the
// session in localStorage by default (supabaseClient.js:14 persistSession).
async function loginOnce(page) {
  if (!OPERATOR_PIN) {
    // Defensive: should never fire because test.skip() at file scope above
    // already excluded this file from the run. Guard for direct invocation.
    test.skip();
    return;
  }
  await page.goto("/");
  // The login form is server-rendered by Vite for the very first paint, so
  // we wait for the PIN input (login.jsx:46). ToT being absent means already
  // authenticated from a previous attempt within this browser context.
  const pinInput = page.locator("#pin-input");
  if (await pinInput.isVisible({ timeout: 8_000 }).catch(() => false)) {
    await pinInput.fill(OPERATOR_PIN);
    await page.getByRole("button", { name: "Login" }).click();
  }
  // Authenticated app shell always renders the bottom nav (the heading alone
  // also shows on the login page — see e2e/helpers/app.js).
  await waitForAppReady(page);
}

test.beforeEach(async ({ page }) => {
  await loginOnce(page);
});

test("login gates unauthenticated access and authenticates with the operator PIN", async ({
  page,
}) => {
  // We already logged in in beforeEach — verify the shell is the dashboard.
  await expect(page.getByRole("heading", { name: /Dashboard/ })).toBeVisible();
  // Pin input must no longer be visible.
  await expect(page.locator("#pin-input")).toHaveCount(0);
});

test("all six bottom-nav tabs are visible and switch pages", async ({
  page,
}) => {
  const tabs = [
    { label: "Home", heading: "Dashboard" },
    { label: "Customers", heading: "Customers" },
    { label: "Delivery", heading: /Daily Delivery/ },
    { label: "Imports", heading: /Milk Imports/ },
    { label: "Billing", heading: "Billing" },
    { label: "More", heading: /Admin Tools|More/ },
  ];

  for (const t of tabs) {
    const navBtn = page.getByRole("button", { name: t.label }).first();
    await expect(navBtn).toBeVisible();
    await navBtn.click();
    // Each page renders a heading matching the tab title per AppShell.jsx:24.
    await expect(
      page.getByRole("heading", { name: t.heading, exact: false }).first(),
    ).toBeVisible({ timeout: 10_000 });
  }
});

test("dashboard renders Today's Delivery stats and quick actions", async ({
  page,
}) => {
  // Two h2-level blocks: "Today's Delivery (...)" and "Recent Bills".
  await expect(
    page.getByRole("heading", { name: /Today's Delivery/ }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Quick Actions" }),
  ).toBeVisible();

  // The Delivery stat grid renders three labels per StatGrid (ui.jsx:282).
  for (const label of ["Delivered", "Skipped", /Total \(L\)/]) {
    await expect(
      page.locator(".stat-label").filter({ hasText: label }).first(),
    ).toBeVisible();
  }

  // Quick Actions: each entry is a <button> with a text label.
  for (const action of [
    "Add Customer",
    "Add Import",
    "Generate Bills",
    "Adjustment",
    "Add Pause",
    "Add Brand",
  ]) {
    await expect(
      page.getByRole("button", { name: action }).first(),
    ).toBeVisible();
  }
});

test("Customers page renders the Add control and at least one card or an Empty state", async ({
  page,
}) => {
  await page.getByRole("button", { name: "Customers" }).click();
  // AppShell renders <h2>Customers</h2> (TAB_TITLES) AND Customers.jsx
  // renders <h3>Customers</h3> via <Section title="Customers">. Both match
  // `name: "Customers"` and strict mode would error on multiple matches —
  // use .first() to disambiguate. Both being visible is itself the contract.
  await expect(
    page.getByRole("heading", { name: "Customers", exact: true }).first(),
  ).toBeVisible();

  // The section header carries the Add control. Subscriptions moved to their
  // own nav tab (bottom-nav "Subs"), so there is no Subscriptions button
  // on the Customers page any more.
  await expect(page.getByRole("button", { name: "+ Add" })).toBeVisible();

  // The list is either populated (.card) or shows the empty state — both
  // are valid; an empty-data error toast would be a regression. The empty
  // message text is "No customers found".
  const cards = page.locator(".card");
  const empty = page.getByText("No customers found");
  // At least one must be present.
  await expect(async () => {
    const n = (await cards.count()) + (await empty.count());
    expect(
      n,
      "no cards and no empty state — page failed to render",
    ).toBeGreaterThan(0);
  }).toPass();
});

test("Bottom nav renders the Subscriptions tab and it opens the Subscriptions page", async ({
  page,
}) => {
  // The Subscriptions tab sits between Customers and Delivery (AppShell TABS).
  await page.getByRole("button", { name: "Subs", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Subscriptions", exact: true }).first(),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "+ Add" })).toBeVisible();
});

test("Delivery page reveals Generate Deliveries + Extra Delivery and stats", async ({
  page,
}) => {
  await page.getByRole("button", { name: "Delivery" }).click();
  // AppShell renders <h2>Daily Delivery</h2> as the tab title — Delivery.jsx
  // has no second heading with this text, so this remains a single match.
  await expect(
    page.getByRole("heading", { name: "Daily Delivery" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: /Generate Deliveries/ }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "+ Extra Delivery" }),
  ).toBeVisible();

  // Date picker exists.
  await expect(page.locator('input[type="date"]').first()).toBeVisible();

  // StatGrid labels (Delivery.jsx:113-118).
  for (const label of ["Scheduled", "Delivered", "Skipped", "Total"]) {
    await expect(
      page.locator(".stat-label").filter({ hasText: label }).first(),
    ).toBeVisible();
  }
});

test("Imports page shows Brand + Import actions, filters, and the Brands list", async ({
  page,
}) => {
  await page.getByRole("button", { name: "Imports" }).click();
  // AppShell h2 "Milk Imports" + Imports.jsx:62 <Section title="Milk Imports">
  // → <h3>. Both match — use .first() for strict-mode safety.
  await expect(
    page.getByRole("heading", { name: "Milk Imports" }).first(),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "+ Brand" })).toBeVisible();
  await expect(page.getByRole("button", { name: "+ Import" })).toBeVisible();

  // All three filters are native <select>s — the old month
  // <input type="month"> was replaced for Firefox/Android-WebView support
  // (see filters.js#buildMonthOptions rationale).
  await expect(page.locator("#import-month")).toBeVisible();
  // The "All Status" / "All Brands" options must exist. Note: <option>
  // elements in a collapsed <select> are always layout-hidden, so
  // toBeVisible() fails — assert presence by count instead.
  await expect(page.locator('option:has-text("All Status")')).toHaveCount(1);
  await expect(page.locator('option:has-text("All Brands")')).toHaveCount(1);

  // Brands card always renders with title "Brands" (Imports.jsx:192).
  await expect(page.getByText("Brands", { exact: true }).first()).toBeVisible();
});

test("Billing page shows Generate Bills + Add Credit Note + filters + KPIs", async ({
  page,
}) => {
  await page.getByRole("button", { name: "Billing" }).click();
  // AppShell h2 "Billing" + Billing.jsx:163 <Section title="Billing"> → <h3>.
  // Both match — strict mode would error otherwise; use .first().
  await expect(
    page.getByRole("heading", { name: "Billing" }).first(),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Add Credit Note" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Generate Bills" }),
  ).toBeVisible();

  // Four status filter chips.
  for (const s of ["All", "Unpaid", "Partial", "Paid"]) {
    await expect(
      page.getByRole("button", { name: s, exact: true }),
    ).toBeVisible();
  }

  // KPI labels (Billing.jsx:205-224).
  for (const label of ["Total Billed", "Collected", "Pending", "Bills"]) {
    await expect(
      page.locator(".stat-label").filter({ hasText: label }).first(),
    ).toBeVisible();
  }
});

test("More page exposes Security, Adjustments, Pause Periods, Diagnostics, Health", async ({
  page,
}) => {
  await page.getByRole("button", { name: "More" }).click();
  await expect(
    page.getByRole("heading", { name: "Admin Tools" }),
  ).toBeVisible();
  await expect(page.getByRole("heading", { name: "Security" })).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Adjustments" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Pause Periods" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Diagnostics" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "System Health" }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Change PIN" })).toBeVisible();
  // Use exact:true — `{ name: "Run" }` would substring-match BOTH "Run" and
  // "Run Health Check" (the next line), violating Playwright strict mode.
  await expect(
    page.getByRole("button", { name: "Run", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Run Health Check" }),
  ).toBeVisible();
});

test("Quick-action buttons open modal dialogs from the Dashboard", async ({
  page,
}) => {
  // Previous tests navigate away from the dashboard — re-home first.
  await page.getByRole("button", { name: "Home" }).click();
  await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();

  for (const [btnText, modalTitle] of [
    ["Add Customer", /Add Customer/],
    ["Add Import", /Add Milk Import/],
    ["Adjustment", /Add Adjustment/],
    ["Add Pause", /Add Pause Period/],
    ["Add Brand", /Add Milk Brand/],
  ]) {
    // Each quick-action Btn wraps an icon + a text span in a flex column.
    // The accessible name is derived from the span text (icons have no
    // aria-label), so `getByRole("button", {name: btnText})` still matches.
    await page.getByRole("button", { name: btnText }).first().click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await expect(
      page.getByRole("heading", { name: modalTitle }).first(),
    ).toBeVisible();
    // Close the modal via the dialog's close button (ui.jsx:138 aria-label).
    await page
      .locator('.modal-header button[aria-label="Close dialog"]')
      .first()
      .click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
  }
});
