# E2E / Integration Tests — S_milk

This folder is the **testing layer** for the Milk Delivery Admin app. It is
deliberately isolated from app code under `src/` (per the project rule that
no test files mix with application source). Nothing here is imported by the
running app; the app is exercised either via Playwright (a real browser) or
via Vitest against the live Supabase HTTP API.

## Layout

```
e2e/
├── README.md                     (this file)
├── helpers/supabase.js           factory: anon & operator Supabase clients
├── database-connection.test.js   Playwright: DB reachable, RLS gates anon,
│                                  every table readable, every RPC exists
├── all-buttons.test.js           Playwright: login, six bottom-nav tabs,
│                                  quick-action modals, every page's controls
├── data-rendering.test.js        Playwright: UI text matches what DB holds
│                                  (customer cards, billing KPIs, brands list)
├── integration-full-flow.test.js Playwright: create customer → generate
│                                  daily logs → bill → partial payment →
│                                  verify DB → RLS-aware cleanup
├── vitest.config.js              separate Vitest config (no app interference)
└── vitest/
    └── api-integration.test.js   Vitest: exercises lib/api.js callApi switch
                                  against live Supabase (no browser needed)
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
download — useful on locked-down networks. To switch to bundled Chromium,
remove the `channel` line and run `npx playwright install chromium` once.

### Vitest integration tests (no browser — just callApi ↔ Supabase)

```bash
npm run test:db
```

Uses `e2e/vitest.config.js` so it never touches the app's `vite.config.js`
test scope. Self-skips when `E2E_OPERATOR_PIN` isn't set so the regular
`npm test` unit suite stays untouched.

### Everything

```bash
npm run test:all    # lint + unit + db integration + build
```

## What runs without `E2E_OPERATOR_PIN`

The suite is **non-zero by design**: even on a fresh checkout that hasn't
provisioned operator credentials, the following tests still actually run
against the live project (not skipped):

- `database-connection.test.js › anon client can reach Supabase but is
  BLOCKED from reading data` — verifies the public anon key cannot read
  customer rows. Verified live 2026-07-27: production gates anon via GRANT
  revocation (PostgREST 42501), not RLS row filtering. The test accepts
  EITHER security model so it stays valid as the deployment hardens.
- `vitest/api-integration.test.js › anon client is blocked from reading
  business tables` — same anon check from the Vitest layer.
- `vitest/api-integration.test.js › supabase project is reachable` —
  sanity-check that the URL + anon key reach the project at all.

Everything else self-skips with a clear message and never even instantiates
the browser fixture, so the host doesn't need to download Edge / Chromium /
ffmpeg binaries just to collect the suite.

## Host requirements

- **Playwright run**: the suite boots Vite's dev server (`npm run dev` on
  `:5173`) via `playwright.config.js`'s `webServer` config and uses
  **Edge** (`channel: "msedge"`). Edge is on every modern Windows host —
  skip the bundled Chromium download entirely. If you re-enable
  `video: "retain-on-failure"` (default is `"off"` because ffmpeg is not
  distributed with Edge), you also need: `npx playwright install ffmpeg`.
- **Vitest run**: no browser at all — direct supabase-js calls from node.

## Required env

All values read from `.env` (same shape as the app):

| Var                   | Required for        | Notes                              |
| --------------------- | ------------------- | ---------------------------------- |
| `VITE_SUPABASE_URL`   | everything          | already in committed .env          |
| `VITE_SUPABASE_ANON_KEY` | everything | already in committed .env |
| `E2E_OPERATOR_PIN`    | all UI + DB tests   | the operator's 6-digit Auth PIN    |
| `E2E_OPERATOR_EMAIL`  | optional override   | defaults to `astamaniac001@gmail.com` |

Add `E2E_OPERATOR_PIN=123456` to your local `.env` (which is git-ignored)
before running the lifecycle tests — otherwise they self-skip with a clear
message.

## Test-data isolation

Every row created by an E2E test is named with the `__e2e__` marker
(see `helpers/supabase.js`). The integration lifecycle cleans up its own
rows per FK cascade order documented in `supabase/schema.sql`. No test
 EVER deletes rows whose name does NOT start with `__e2e__` — the
operator's real data is safe.