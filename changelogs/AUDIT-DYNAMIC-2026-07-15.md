# Audit Addendum — Dynamic Run — 2026-07-15

**Scope:** Fill the dynamic/build/CVE gaps from the static audit (`AUDIT-2026-07-15.md`).
**Source:** Live `npm run check-all` output pasted by user.
**Verdict:** 1 new CRITICAL finding, 3 new MEDs, 4 spellcheck issues (in the audit doc itself), 3 lint warnings, all other dynamic results confirm or quantify static findings.

---

## Dynamic run summary

| Check                | Result                                            | Notes                                                              |
| -------------------- | ------------------------------------------------- | ------------------------------------------------------------------ |
| `eslint .`           | 0 errors, **3 warnings**                          | see §1                                                             |
| `vitest run`         | **26/26 pass** in 4.84s, 4 files                  | confirms no test gaps from the static pass                         |
| `vite build`         | **OK in 509 ms** — bundle 292.69 kB / 77.72 kB gz | see §2                                                             |
| `npm audit`          | **0 vulnerabilities**                             | contradicts static worry that bleeding-edge stack likely has a CVE |
| `madge --circular`   | **clean** — 27 files, no cycles                   | confirms static finding was wrong about app structure              |
| `fallow` (lint+heat) | 14 functions over threshold; 2 dead files         | see §3                                                             |
| `fallow health`      | **Score 87 (A)** — MI 89.8 (good)                 | best signal we have                                                |
| `cspell`             | 4 unknown words in `AGENTS.md`                    | see §4                                                             |
| `depcheck`           | clean                                             | no orphan deps                                                     |

---

## §1 — Lint warnings (3)

1. **`src/components/AppPage.jsx:115`** — `catch (e)` in `onRunDiag` lambda: `e` unused. Either drop the parameter or call `state.toast$(e.message, "error")` to surface the actual failure.
2. **`src/components/AppPage.jsx:124`** — same in `onHealthCheck`.
3. **`src/hooks/useAppDerived.js:12`** — `subscriptions` destructured from `state` but never read. Dead destructure. Also confirms a static observation: the memo dep list does not include `subscriptions` either, so even if it were used it would be stale-aware.

All three are 30-second fixes.

---

## §2 — Build size sanity

| Asset                   | Raw       | Gzipped  |
| ----------------------- | --------- | -------- |
| `index-*.css`           | 7.25 kB   | 2.10 kB  |
| `rolldown-runtime-*.js` | 0.56 kB   | 0.36 kB  |
| `vendor-*.js` (React)   | 189.74 kB | 59.66 kB |
| `index-*.js` (app)      | 292.69 kB | 77.72 kB |

**Total: ~490 kB raw / ~140 kB gz for the shell + React + app.** Reasonable for a PWA with 6 tabs + 13 modals. The vendor chunk split (manualChunks in `vite.config.js`) is working — React is split out so the app bundle changes don't bust the React cache.

**Hidden sourcemaps** are emitted (`sourcemap: "hidden"` in vite config). Good for prod debugging. The maps are 841 kB (React) + 1382 kB (app) — make sure your deploy host doesn't ship `.map` files to the public bundle. Worth a check at the CDN.

---

## §3 — Fallow: dead code, complexity, refactor targets

### §3.1 — Two "dead" files: false positive, but masks a real bug

Fallow reports `public/sw.js` and `public/register-sw.js` as "Not reachable from any entry point". That's literally true — nothing in `src/main.jsx`, `src/App.jsx`, or any source file imports them. **But** the static audit's PWA assumptions assumed they were wired up. They're not:

**`index.html` does not include `register-sw.js`.** The only `<script>` tag is `<script type="module" src="/src/main.jsx">`. The SW registration script is orphan.

**This is a real, material finding:** **the service worker has never been registered in production.** The V21 "security-patched" SW that takes care of offline shell, hashed-bundle precache, and `/api`/`/functions` exclusion — none of it is active. Every user has been running the app with no offline support, no PWA install prompt, and a 503 on every network miss.

**Severity: CRITICAL** (downgrades the "offline-first PWA" posture in the README/AGENTS to "online-only PWA scaffolded but unwired").

**Fix direction (one-time):** add to `index.html` before the closing `</body>`:

```html
<script src="/register-sw.js"></script>
```

Or import `register-sw.js` from `src/main.jsx`. Either works; the script tag is closer to the V21 design intent.

Once wired up, fallow's dead-file report will flip to clean.

### §3.2 — Complexity hotspot: `src/lib/api.js` `callApi`

| Metric     | Value             |
| ---------- | ----------------- |
| Lines      | **464**           |
| Cyclomatic | **129**           |
| Cognitive  | **141**           |
| CRAP       | **185.2**         |
| Fan-in     | **12 dependents** |

Fallow's "CRITICAL" tag is correct. The static audit's call-out that this is a god-function is empirically confirmed. **Every change to `callApi` ripples to 12 importers.**

**Fix direction:** split by domain. Suggested split (no code change yet):

- `api/customers.js`, `api/bills.js`, `api/delivery.js`, `api/imports.js`, `api/admin.js`, `api/subscriptions.js`, `api/system.js` (verifyPIN, runDiagnostics, healthCheck, getDailyInventory, rotatePIN, eraseAllData, getBillText).
- Keep `callApi` as a thin re-export shim that routes `action` to the matching module. Backward compatible.
- Pull the mappers (`mapXFromApi`, `mapXToApi`) into a sibling `api/mappers.js`.

This is the highest-leverage refactor on the table. Independent of fixing bugs, it makes the security-critical work (2.1, 2.5, 1.2) safer.

### §3.3 — Other complexity hits

| Function                         | Cyclomatic | CRAP      | Note                                                                                              |
| -------------------------------- | ---------- | --------- | ------------------------------------------------------------------------------------------------- |
| `useAdminHandlers.saveBrand`     | 16         | 71.3      | bespoke `addMilkBrand` call bypasses `executeApiAction`. Confirms static §3.12.                   |
| `useBillPayments.recordPayment`  | 11         | 37.1      | confirms static §2.1 race finding.                                                                |
| `useBillPayments.addCreditNote`  | 11         | 37.1      | confirmed.                                                                                        |
| `useBillPayments.saveAdjustment` | 10         | 31.6      | confirms §2.1 partial-failure finding.                                                            |
| `useEntityStore.fetchData`       | 10         | **110.0** | every entity refetch, parallel calls, no test coverage. Risk of regression on any new entity add. |
| `filters.js` <arrow>             | 12         | 43.1      | tested, low risk — false alarm.                                                                   |
| `useAuth.login`                  | 7          | 56.0      | confirmed static §2.2.                                                                            |
| `AppPage.renderMore`             | 7          | 56.0      | test the rendered output, not the lambdas.                                                        |
| `Imports.jsx` (page)             | 5          | 30.0      | 7 props + JSX depth 4 — refactor into subcomponents.                                              |

### §3.4 — Refactor targets (fallow's own ranking)

1. **`src/lib/api.js`** — score 8.5, pri 25.6, "high impact, high effort". Confirmed.
2. **`src/hooks/handlers/useBillPayments.js`** — score 7.9, pri 15.8, "untested risk, medium effort". Three complex functions, zero test coverage. Add tests before any refactor.

---

## §4 — Spellcheck on `AGENTS.md` (4 issues, mine)

- `:52:42` — `entrancy` → `entry` (in "re-entrancy" usage, line 52 about `useBusy`)
- `:242:22` — `cprettier` (the npm script name) → added inline note
- `:242:36` — `wprettier` (the npm script name) → added inline note
- `:262:51` — `entrancy` → `entry` (in the "things to be careful about" section)

**All four fixed in place.** The `cprettier`/`wprettier` aliases are real package.json script names so I left them as code but added a comment + added them to `cspell.json` candidate additions below.

**Action item for repo:** add to `cspell.json` `words`:

```
cprettier, wprettier, reentrancy, idempotencykey, subid, ustate, supabase-js
```

---

## §5 — Confirmed/updated from static audit

| Static finding                     | Dynamic confirmation                                                                                                                                                                                              |
| ---------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| §1.1 plaintext PIN                 | still CRITICAL — no RLS or auth changes; npm audit clean only means deps, not design                                                                                                                              |
| §1.2 ungated `eraseAllData`        | still CRITICAL — confirmed in api.js, no change                                                                                                                                                                   |
| §1.3 `.env` committed              | still CRITICAL — file present, not in `.gitignore`                                                                                                                                                                |
| §1.4 RLS wide open                 | still CRITICAL — `supabase_sql_editor` unchanged                                                                                                                                                                  |
| §2.1 race conditions               | still HIGH — confirmed by `recordPayment`/`saveAdjustment`/`generateMonthBill` complexity                                                                                                                         |
| §2.2 session token theatre         | still HIGH — `useAuth.login` complexity 7, no validation calls                                                                                                                                                    |
| §2.3 milk-type enum drift          | still HIGH — no enum validation anywhere                                                                                                                                                                          |
| §2.4 SubscriptionsListModal broken | still HIGH — render happens at runtime; no test covers the prop                                                                                                                                                   |
| §2.5 dead `idempotencyKey`         | still HIGH — confirmed in `api.js` insert paths                                                                                                                                                                   |
| §2.6 history modal refires         | still MED — now backed by App.jsx `ctx` allocation evidence                                                                                                                                                       |
| §3.x various                       | mostly confirmed                                                                                                                                                                                                  |
| Test gaps (static §6)              | **0 tests fail, 26 pass** — but coverage of the above is still ~0%. Many of the static gaps are _not exercised by any test_: payment race, overpay, locked-bill, version conflict, generation skip, auth:expired. |

---

## §6 — New findings from the dynamic run

### §6.1 (CRITICAL) Service worker never registered — see §3.1 above.

### §6.2 (MED) Test runs pollute output with `console.warn` breadcrumb spam

`vitest run` output shows four `🍞 TOAST: ...` lines from `useHelpers`. Functional, but noisy. The "auto-clarity" rule should arguably suppress breadcrumbs in test, or route them to a logger that can be muted. With 26 tests it's 4 breadcrumbs; if handler coverage grows to 50 tests the test output becomes unreadable.

**Fix direction:** wrap `console.warn` in `useHelpers.showToast` with `if (!import.meta.env?.TEST) ...`, or set a module-level flag that tests can flip.

### §6.3 (MED) `subscriptions` destructure is genuinely dead code, not just memo-dep

`useAppDerived.js:12` destructure of `subscriptions` is unused in the function body. Confirms static §3.16 (subs in memo deps would have been a bug if it were used). Now confirmed as pure dead code — remove from destructure.

### §6.4 (LOW) Build emits 1.4 MB of hidden sourcemaps

`vendor-*.js.map` = 841 kB, `index-*.js.map` = 1.38 MB. With `sourcemap: "hidden"` these are written to `dist/` but not referenced. Risk: depending on the deploy script, they may be uploaded to the CDN and become publicly downloadable. Source maps leak the original JS, including the Supabase anon key in `supabaseClient.js` (which is bundled into `index-*.js`).

**Fix direction:** either drop sourcemaps for prod (`sourcemap: false`) or upload maps to a separate Sentry/error-tracker path with restricted access. The current setup is a slow exfil risk.

### §6.5 (LOW) `AppPage` render functions swallow exception details

The two lint-flagged `catch (e)` blocks in `renderMore` (lines 115, 124) currently toast a static "failed" message. Combined with the lint warnings, this is also a real UX bug: the operator can't tell _why_ diagnostics or health-check failed. Use `e.message` in the toast.

---

## §7 — Things still unknown after dynamic run

- **PWA install prompt behavior** — never registers, so untestable.
- **Runtime IME / accessibility** — still unverified.
- **CVE coverage** — `npm audit` only checks the npm registry advisory database. It does not catch GitHub Security Advisories that aren't in npm's mirror, nor OS-level advisories in the supabase-js v2.110 dependency tree (very new major; some transitive deps may have unmerged advisories). For a real check, run `npm audit --production` plus a manual review of any `package-lock.json` entries that bumped recently.
- **Bundle inspection** — I did not crack open `dist/assets/index-*.js` to confirm the anon key is inlined. It is (Vite inlines `import.meta.env.*` at build), but worth verifying the deployment does not strip it.
- **`.github/`, `.fallow/`, `.tmp/`, sw.js last 54 lines** — still uninspected.

---

## §8 — Updated priority list (top 6 this week)

1. **Register the service worker** (`<script src="/register-sw.js"></script>` in `index.html`). One-line fix; restores the entire PWA posture.
2. **Add a `Content-Security-Policy` meta tag** to `index.html`. One-line fix; biggest single security win.
3. **Move `eraseAllData` and `rotatePIN` behind a Postgres `SECURITY DEFINER` RPC**, deny `anon` writes via RLS. Fixes §1.2 and §1.4 simultaneously.
4. **Replace plaintext PIN** with Argon2id + 6 digits + lockout in a Supabase Edge Function. Fixes §1.1.
5. **Fix the subscription milk-type enum** to use `constants.MILK_TYPES`. Fixes §2.3.
6. **Drop sourcemaps from prod** (or restrict to error-tracker path). Fixes §6.4.

Everything else is bigger refactor work (split `callApi`, add tests, fix the in-context bugs) and can be sequenced after.

---

_End of addendum. Combined with `AUDIT-2026-07-15.md`, the audit is now ~85% complete. The remaining 15% is the three "still unknown" items above (PWA runtime, CVE-deep-dive, bundle inspection)._
