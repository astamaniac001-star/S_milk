// e2e/helpers/app.js
//
// Shared UI readiness helper for the browser tests.
//
// The heading "Milk Delivery Admin" renders on BOTH the login page and the
// authenticated AppShell, so waiting for it does NOT prove the app is ready.
// `.bottom-nav` only renders inside AppShell — waiting for it removes the
// race between the shell mount and the test's first interaction (a click on
// a bottom-nav button otherwise times out while the shell is still rendering).

import { expect } from "@playwright/test";

export async function waitForAppReady(page) {
  await expect(page.locator(".bottom-nav")).toBeVisible({ timeout: 30_000 });
}
