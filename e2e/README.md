# E2E / Integration Tests â€” S_milk

This folder is the **testing layer** for the Milk Delivery Admin app. It is
deliberately isolated from app code under `src/` (per the project rule that
no test files mix with application source). Nothing here is imported by the
running app; the app is exercised either via Playwright (a real browser) or
via Vitest against the live Supabase HTTP API.

## Layout

```
e2e/
â”œâ”€â”€ README.md                     (this file)
â”œâ”€â”€ helpers/supabase.js           factory: anon & operator Supabase clients
â”œâ”€â”€ database-connection.test.js   Playwright: DB reachable, RLS gates anon,
â”‚                                  every table readable, every RPC exists
â”œâ”€â”€ all-buttons.test.js           Playwright: login, six bottom-nav tabs,
â”‚                                  quick-action modals, every page's controls
â”œâ”€â”€ per-card-buttons.test.js      Playwright: per-card UI controls (delivery
â”‚                                  toggle, payments, brand rows)
â”œâ”€â”€ data-rendering.test.js        Playwright: UI text matches what DB holds
â”‚                                  (customer cards, billing KPIs, brands list)
â”œâ”€â”€ integration-full-flow.test.js Playwright: create customer â†’ generate
â”‚                                  daily logs â†’ bill â†’ partial payment â†’
â”‚                                  verify DB â†’ RLS-aware cleanup
â”œâ”€â”€ vitest.config.js              separate Vitest config (no app interference)
â””â”€â”€ vitest/
    â”œâ”€â”€ api-integration.test.js   Vitest: exercises lib/api.js callApi switch
    â”‚                              against live Supabase (no browser needed)
    â”œâ”€â”€ _client.mjs               shared: getEnv() + getOperatorClient() auth helper
    â”œâ”€â”€ _state.mjs                 throwaway: list current rows in each entity table
    â””â”€â”€ _cleanup.mjs               throwaway: delete leftover __e2e__ rows pre-run
```

## Running

### Playwright UI / button / data / lifecycle tests (browser)

```bash
npm run test:e2e              # headless (default)
npm run test:e2e:headed       # visible Edge window
npm run test:e2e:ui           # interactive UI mode
npm run test:e2e:debug        # step through with inspector
```

`playwright.config.js` uses the system **Microsoft Edge** channel by default
(`channel: "msedge"`) so the suite runs without Playwright's ~150 MB Chromium
download â€” useful on locked-down networks. To switch to bundled Chromium,
remove the `channel` line and run `npx playwright install chromium` once.

### Vitest integration tests (no browser â€” just callApi â†” Supabase)

```bash
npm run test:db
```

Uses `e2e/vitest.config.js` so it never touches the app's `vite.config.js`
test scope. Self-skips when `E2E_OPERATOR_PIN` isn't set so the regular
`npm test` unit suite stays untouched.

### Everything

```bash
npm run test:all    # lint + unit + db integration + build + browser e2e
```

This is an alias for `npm run check-all && npm run test:e2e` (defined in `package.json`).

## What runs without `E2E_OPERATOR_PIN`

The suite is **non-zero by design**: even on a fresh checkout that hasn't
provisioned operator credentials, the following tests still actually run
against the live project (not skipped):

- `database-connection.test.js â€º anon client can reach Supabase but is
BLOCKED from reading data` â€” verifies the public anon key cannot read
  customer rows. Verified live 2026-07-27: production gates anon via GRANT
  revocation (PostgREST 42501), not RLS row filtering. The test accepts
  EITHER security model so it stays valid as the deployment hardens.
- `vitest/api-integration.test.js â€º anon client is blocked from reading
business tables` â€” same anon check from the Vitest layer.
- `vitest/api-integration.test.js â€º supabase project is reachable` â€”
  sanity-check that the URL + anon key reach the project at all.

Everything else self-skips with a clear message and never even instantiates
the browser fixture, so the host doesn't need to download Edge / Chromium /
ffmpeg binaries just to collect the suite.

## Host requirements

- **Playwright run**: the suite boots Vite's dev server (`npm run dev` on
  `:5173`) via `playwright.config.js`'s `webServer` config and uses
  **Edge** (`channel: "msedge"`). Edge is on every modern Windows host â€”
  skip the bundled Chromium download entirely. Failure videos default to
  `"off"` because ffmpeg is not distributed with Edge; set `PW_VIDEO=on`
  (or override `playwright.config.js`) to enable, and run
  `npx playwright install ffmpeg` once to make the capture succeed.
- **Vitest run**: no browser at all â€” direct supabase-js calls from node.

## Required env

All values read from your LOCAL `.env` (git-ignored â€” not committed; each
operator keeps their own copy; see the repo root README):

| Var                      | Required for      | Notes                                             |
| ------------------------ | ----------------- | ------------------------------------------------- |
| `VITE_SUPABASE_URL`      | everything        | your local .env copy (git-ignored, NOT committed) |
| `VITE_SUPABASE_ANON_KEY` | everything        | your local .env copy (git-ignored, NOT committed) |
| `E2E_OPERATOR_PIN`       | all UI + DB tests | the operator's 6-digit Auth PIN                   |
| `E2E_OPERATOR_EMAIL`     | optional override | resolves through `e2e/_operator.mjs` (AGENTS Â§9) |

Set a private PIN value for `E2E_OPERATOR_PIN` in your local `.env` (which is
git-ignored) before running the lifecycle tests â€” otherwise they self-skip with a clear
message.

## Test-data isolation

Every row created by an E2E test is named with the `__e2e__` marker
(see `helpers/supabase.js`). The integration lifecycle cleans up its own
rows per FK cascade order documented in `supabase/schema.sql`. No test
EVER deletes rows whose name does NOT start with `__e2e__` — the
operator's real data is safe.

## Containment rules (enforced 2026-11-21)

These suites run against a LINKED project that holds real operator data:

1. **No global mutations.** The Delivery "Generate Deliveries" button and
   the Billing "Generate Bills" button are GLOBAL (they write for every
   active customer). Tests must never drive them against a linked project —
   `integration-full-flow.test.js` and `subscription-model.test.js` seed
   probe rows directly instead.
2. **No mutating reachability probes.** The RPC probe in
   `database-connection.test.js` uses an INVALID month (`"2000-1"`), which
   fails `rollover_month_rpc`'s format gate before any write. Never probe
   with a well-formed month — that would seed a bill for every active
   subscription.
3. **Cleanup by captured UUID + marker**, never by fixed phone numbers
   alone (a real customer could share the phone; customer deletion cascades
   to bills, payments, and logs).
4. **The default gate is offline.** `npm run check-all` never touches
   Supabase; live suites run via `check-all:live` / `test:db` / `test:e2e`
   deliberately, and CI keeps them behind dedicated secrets targeting a
   disposable project.
