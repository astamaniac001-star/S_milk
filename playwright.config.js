// playwright.config.js — E2E config for the S_milk admin app.
//
// NETWORK-CONSTRAINED HOST NOTE: this config deliberately uses the system
// Microsoft Edge channel (`channel: "msedge"`) instead of Playwright's
// bundled Chromium download. Edge is built on the same Chromium engine and
// exists on every modern Windows host, so the suite runs without the
// ~150 MB browser download that fails on locked-down networks. To switch
// to bundled Chromium later, remove the `channel` line and run
// `npx playwright install chromium` once.
//
// The config boots the Vite dev server (`npm run dev` on :5173) per run when
// no server is already listening. Tests run sequentially (`workers: 1`,
// `fullyParallel: false`) because the app sits behind a single shared
// Supabase project with live data — parallel writes would race against
// each other and against the operator's real data.
//
// All test files live in `./e2e`. NONE of them touch the actual app source
// under `src/`; they only drive the running app via the browser and the
// Supabase HTTP API. This keeps the test layer fully isolated from app
// code per AGENTS.md (no new files inside `src/`).

import { defineConfig, devices } from "@playwright/test";

const REPORT_DIR = "e2e-test-results";

export default defineConfig({
  testDir: "./e2e",
  // The Vitest integration tests live under e2e/vitest/. They import Vitest
  // globals (`describe.skipIf`, `vi`, ...) that Playwright's test loader
  // cannot evaluate — including them causes a `Cannot read properties of
  // undefined (reading 'config')` TypeError at collection time. Exclude
  // them so `playwright test --list` and the actual run stay scoped to the
  // browser-driven Playwright tests. (Use `npm run test:db` to run the
  // Vitest suite, which uses e2e/vitest.config.js instead.)
  testMatch: /.*\.test\.js$/,
  testIgnore: /vitest[\\/].*\.test\.js$/,
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  // 1 local retry (2026-11-22): this host's connection to Supabase drops
  // single fetches mid-run ("fetch failed" on login/bills/boot), which
  // rotated random single-test failures across runs. A still-failing test
  // now fails TWICE — real regressions still surface; a flaky-then-pass is
  // reported by the list reporter as "flaky", not silently green.
  retries: process.env.CI ? 2 : 1,
  workers: 1,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: [["list"], ["html", { outputFolder: REPORT_DIR, open: "never" }]],

  use: {
    baseURL: "http://localhost:5173",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    // Network-constrained hosts don't have Playwright's bundled ffmpeg
    // binary. Video recording requires it — disable unless explicitly
    // requested (override via env PW_VIDEO=on). On a host that already has
    // ffmpeg on PATH, Playwright will find it; otherwise the suite crashes
    // at page-creation time without this guard.
    video: process.env.PW_VIDEO === "on" ? "retain-on-failure" : "off",
    channel: "msedge",
    actionTimeout: 15_000,
    navigationTimeout: 30_000,
  },

  projects: [
    {
      name: "desktop-edge",
      use: { ...devices["Desktop Edge"] },
    },
  ],

  // Boot `npm run dev` if no server is already on :5173.
  webServer: {
    command: "npm run dev",
    url: "http://localhost:5173",
    timeout: 120_000,
    reuseExistingServer: !process.env.CI,
    stdout: "ignore",
    stderr: "inherit",
  },
});
