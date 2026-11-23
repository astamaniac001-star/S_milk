// e2e/helpers/app.js
//
// Shared UI readiness + login helpers for the browser tests.
//
// The heading "Milk Delivery Admin" renders on BOTH the login page and the
// authenticated AppShell, so waiting for it does NOT prove the app is ready.
// `.bottom-nav` only renders inside AppShell — waiting for it removes the
// race between the shell mount and the test's first interaction (a click on
// a bottom-nav button otherwise times out while the shell is still rendering).

import { expect } from "@playwright/test";
import { OPERATOR_PIN } from "./supabase.js";

export async function waitForAppReady(page) {
  await expect(page.locator(".bottom-nav")).toBeVisible({ timeout: 30_000 });
}

// FIX (2026-11-22): this host's connection to Supabase drops requests
// intermittently — the login screen surfaces "Failed to fetch" and the old
// fill-once flow failed whole suites on a single blip. Fill + click with a
// bounded retry: the PIN stays in the box, so a re-click suffices. A real
// auth rejection (wrong PIN) shows a different message and fails fast.
export async function loginViaPin(page, { timeout = 10_000 } = {}) {
  const pinInput = page.locator("#pin-input");
  const needsLogin = await pinInput
    .isVisible({ timeout: 8_000 })
    .catch(() => false);

  if (needsLogin) {
    if (!OPERATOR_PIN) {
      throw new Error(
        "loginViaPin: the login screen is visible but E2E_OPERATOR_PIN is not set.",
      );
    }
    await pinInput.fill(OPERATOR_PIN);
    for (let attempt = 0; attempt < 3; attempt += 1) {
      await page.getByRole("button", { name: "Login" }).click();
      const entered = await page
        .locator(".bottom-nav")
        .waitFor({ state: "visible", timeout })
        .then(() => true)
        .catch(() => false);
      if (entered) return;
      const networkBlip = await page
        .getByText(/failed to fetch/i)
        .isVisible()
        .catch(() => false);
      if (!networkBlip) break; // definitive rejection — report it as-is
    }
  }

  await expect(page.locator(".bottom-nav")).toBeVisible({ timeout: 30_000 });
}
