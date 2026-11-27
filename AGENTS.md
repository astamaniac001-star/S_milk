# AGENTS.md â€” S_milk / c1milk

> Single source of truth for AI agents working in this repo. Read this first.
>
> **Accuracy rule:** verify claims against the current working tree. A passing
> build, an audit comment, or a commit message is not proof that behavior is
> correct. Generated database artifacts describe the deployed schema;
> historical SQL does not.

This document is a complete, standalone description of the project â€” what it
is, how every layer connects, and the rules for changing it. The human-facing
twin with the same depth lives in [`README.md`](./README.md); keep both in
sync (Â§19).

---

## What this app is

**Milk Delivery Admin** â€” an internal PWA for a small milk-delivery business
in India. One operator, from a phone, uses it to:

- Manage customers (identity only) and their **brand-aware** delivery subscriptions
- Record which customers got milk / were skipped each day, plus ad-hoc extras
- Track milk purchases from brands/suppliers ("imports") and manage per-brand rates
- Generate and collect monthly bills (lock/unlock, payments, WhatsApp share)
- Handle adjustments, credit notes, pause periods, and month rollover (manual)

It's **not** a customer-facing app: single-operator, installable PWA, offline-tolerant.

## Tech stack (verified against package.json)

| Layer      | Choice                                                               | Notes                                                       |
| :--------- | :------------------------------------------------------------------- | :---------------------------------------------------------- |
| UI         | React 19.2 + Vite 8.3                                                | JSX, no TypeScript; build target es2020, no prod sourcemaps |
| Icons      | lucide-react 1.24                                                    |                                                             |
| Backend    | **Supabase directly** (no Node server)                               | `@supabase/supabase-js` 2.111; PostgREST 14.5               |
| Service Wk | Vanilla `public/sw.js`                                               | Cache-first shell; network-only for `/api` + `/functions`   |
| State      | React hooks (no Redux/Zustand)                                       | Composable custom hooks                                     |
| Routing    | Tab-based (no react-router)                                          | State field `tab` in `useAppUi`                             |
| Tests      | Vitest 4 + jsdom 29 + Testing Library; Playwright 1.62 (browser e2e) | Coverage thresholds enforced separately                     |
| Lint       | ESLint 10 flat config + react-hooks + react-refresh                  | `no-console` warn (warn/error allowed)                      |
| Other      | cspell, fallow, madge, prettier, depcheck                            | Advisory; not all are in `check-all`                        |

## Repository layout

```
src/
â”œâ”€â”€ main.jsx                 # Mounts <App/> into #app-root (React.StrictMode)
â”œâ”€â”€ App.jsx                  # Auth gate â†’ ErrorBoundary â†’ Shell + Page + Modals + Toast
â”œâ”€â”€ index.css                # "Ledger" design system: light/dark tokens +
                             # all form/shell classes (.field, .input, .btn-*, .card, .modal-overlay, .toast, .bottom-nav)
â”œâ”€â”€ lib/
â”‚   â”œâ”€â”€ supabaseClient.js    # Single lazy `supabase` instance + configError (no module-eval throw)
â”‚   â”œâ”€â”€ api.js               # ðŸ”‘ callApi(action, payload) â€” barrel + DISPATCH table (39 actions)
â”‚   â”œâ”€â”€ api/                 # Per-domain implementations
â”‚   â”‚   â”œâ”€â”€ mappers.js       # mapXFromApi / mapXToApi (DB snake_case â†” UI camelCase)
â”‚   â”‚   â”œâ”€â”€ shared.js        # toArray, updateWithVersion, must, isAuthError, AuthzError, dayOfWeekKolkata
â”‚   â”‚   â”œâ”€â”€ customers.js     # getCustomers, addCustomer, updateCustomer, deactivateCustomer
â”‚   â”‚   â”œâ”€â”€ subscriptions.js # rolloverMonth, getSubscriptions, saveSubscription, deleteSubscription, getSubscriptionHistory
â”‚   â”‚   â”œâ”€â”€ delivery.js      # getDailyLogs, updateLogEntry, bulkUpsertLogs, generateDailyLogsForDate, addAdHocLog
â”‚   â”‚   â”œâ”€â”€ billing.js       # getBills, lockBill, unlockBill, recordPayment, generateMonthBill, getBillText
â”‚   â”‚   â”œâ”€â”€ adjustments.js   # get/add/applyAdjustment, get/add/applyCreditNote
â”‚   â”‚   â”œâ”€â”€ imports.js       # milk_imports CRUD + confirm/delete RPCs + getBrands + saveBrand + getDailyInventory
â”‚   â”‚   â””â”€â”€ admin.js         # getPauses, addPausePeriod, runDiagnostics, healthCheck, rotatePIN
â”‚   â”œâ”€â”€ constants.js         # DAYS, MILK_TYPES (7), PAY_MODES (7), NEW_SUB_DEFAULTS, OPERATOR_EMAIL (status palette lives in ui.jsx)
â”‚   â”œâ”€â”€ breakdowns.js        # Pure aggregations shared by Delivery + Imports:
â”‚   â”‚                    # sortBrandTypeRows, buildQuantityBreakdown, buildStockBreakdown
â”‚   â”œâ”€â”€ filters.js           # Pure filters (customers/imports/bills) + month
â”‚   â”‚                    # options + import day/range modes + defaultImportRange +
â”‚   â”‚                    # bill search + newest/due/name sort (filterBills)
â”‚   â”œâ”€â”€ utils.js             # toNum, fmt, getToday [Asia/Kolkata], getDaysAgoIST, shiftDate, cleanPhone, dayLabels, matchBrandByMilkType, brandLabel, generateKey
â”‚   â”œâ”€â”€ validation.js        # Barrel re-exporting validation/*
â”‚   â”œâ”€â”€ validation/          # customer.js, import.js, subscription.js (validateSubscriptionForm)
â”‚   â””â”€â”€ database.types.ts    # Generated current Supabase types; never edit manually
â”œâ”€â”€ hooks/
â”‚   â”œâ”€â”€ useAuth.js           # Supabase Auth session + 6-digit operator PIN login
â”‚   â”œâ”€â”€ useAppState.js       # Composition root: useDayTick â†’ useAppUi â†’ useFilterState â†’ useEntityStore â†’ useAppDerived
â”‚   â”œâ”€â”€ useAppDerived.js     # Memoized: activeC, subsByCustomer, activeSubs, totalRevenue, pendingDues, filtered*, todayLogs, selectedDateLogs, confirmedStock
â”‚   â”œâ”€â”€ useAppHandlers.js    # Spreads 6 domain handler hooks
â”‚   â”œâ”€â”€ useBusy.js           # Re-entrancy guard; filters React SyntheticEvents from args
â”‚   â”œâ”€â”€ useEntityStore.js    # 9 entity arrays + safeFetch + refresh + useFilterState
â”‚   â”‚                    # + hydration flags (coreLoading/dateLoading/loading)
â”‚   â”‚                    # + billSearch/billSort filter state
â”‚   â””â”€â”€ handlers/
â”‚       â”œâ”€â”€ shared.js        # useHelpers(): showToast, executeApiAction, handleFormAction, saveWithValidation
â”‚       â”œâ”€â”€ useCustomerHandlers.js
â”‚       â”œâ”€â”€ useBillingHandlers.js   # useBillPayments + useBillOperations
â”‚       â”œâ”€â”€ useBillPayments.js      # recordPayment (idempotency-key lifecycle), adjustments, credit notes
â”‚       â”œâ”€â”€ useBillOperations.js    # generateMonthlyBills, lockBill, unlockBill, whatsapp
â”‚       â”œâ”€â”€ useImportHandlers.js
â”‚       â”œâ”€â”€ useDeliveryHandlers.js
â”‚       â”œâ”€â”€ useAdminHandlers.js     # Pauses + brands + diagnostics + health + PIN rotate
â”‚       â””â”€â”€ useSubscriptionHandlers.js
â”œâ”€â”€ pages/                   # Dashboard, Customers, Subscriptions, Delivery, Imports, Billing, More (+ tests)
â”œâ”€â”€ components/
â”‚   â”œâ”€â”€ AppShell.jsx         # TABS (7), header, bottom nav, load-error banner, dark mode, online badge
â”‚   â”œâ”€â”€ AppPage.jsx          # PAGE_RENDERERS: tab â†’ page
â”‚   â”œâ”€â”€ AppModals.jsx        # MODAL_RENDERERS: 15 modal types â†’ components
â”‚   â”œâ”€â”€ ErrorBoundary.jsx    # Class component â€” Reload / Sign-out & reload
â”‚   â”œâ”€â”€ login.jsx            # 6-digit operator PIN form
â”‚   â”œâ”€â”€ ui.jsx               # Badge, Toast, Modal (focus trap + footer slot), Btn, Field, Card,
â”‚   â”‚                    # CardHeader (icon/subtitle), Empty, Section, StatGrid (accent),
â”‚   â”‚                    # ActiveBrandOptions (valueKey="id"), ActiveCustomerOptions,
â”‚   â”‚                    # + redesign primitives: IconButton, Toolbar, SearchInput, ChipRow,
â”‚   â”‚                    #   Skeleton, ProgressRing, MiniBars
â”‚   â”œâ”€â”€ forms.jsx            # Barrel re-exporting 11 modals from modals/
â”‚   â””â”€â”€ modals/              # 12 modal components (incl. shared.jsx); ChangePinModal imported directly
â”œâ”€â”€ assets/                  # Static images (vite.svg, react.svg, hero.png)
â””â”€â”€ test/setup.js            # Vitest + Testing Library setup (referenced from vite.config.js)

public/                      # sw.js (cache-first shell), register-sw.js, app.css,
                             # apply-dark-mode.js (early theme apply; stored preference wins,
                             # else prefers-color-scheme), manifest.json, icons, robots.txt
supabase/
â”œâ”€â”€ schema.sql               # Generated present-state schema; never edit manually
â””â”€â”€ migrations/              # Historical ledger (present since the 2026-11 baseline;
                             # schema.sql is the generated snapshot; ignore for discovery
scripts/db-baseline.js       # db:baseline -> <ts>_initial_schema.sql (schema-only; data backup opt-in, git-ignored)
e2e/                         # Playwright + live-DB Vitest suites (see e2e/README.md)
```

Root config: `vite.config.js` (test+coverage+chunks), `eslint.config.js`,
`cspell.json`, `playwright.config.js`. `dist/`, `coverage/`,
`e2e-test-results/` are git-ignored artifacts.

## How the app works (the one-page map)

**Data path** â€” everything funnels through one door:

```
UI (pages + modals) â†’ handlers (hooks/handlers/*) â†’ callApi() [src/lib/api.js]
  â†’ DISPATCH table â†’ lib/api/<domain>.js â†’ mappers.js â†’ supabase-js
    â†’ RLS / SECURITY DEFINER RPCs â†’ PostgreSQL (13 tables, 9 RPCs)
```

**State path** â€” one composition root, never recompose in pages:

```
useAppState(auth)
  â”œâ”€ useDayTick()      â€” 60s tick + visibility/focus â†’ `today` (midnight rollover)
  â”œâ”€ useAppUi()        â€” tab, toast (timer per id), modal, form, logDate, billMonth, setF
  â”œâ”€ useFilterState()  â€” custSearch/custFilter, subSearch/subFilter, impFilter, billFilter, diag*
  â”œâ”€ useEntityStore()  â€” 9 entity arrays; two fetch groups:
  â”‚     date-independent (7 parallel reads: customers, imports, adjustments,
  â”‚     pauses, brands, subscriptions, creditNotes â€” on login + refresh)
  â”‚     date-dependent (getBills{month} + getDailyLogs{date} â€” on date/month change)
  â””â”€ useAppDerived()   â€” single useMemo for all derived stats/filtered lists

useAppHandlers(state) â†’ 6 domain hooks spread flat
```

**Error path** â€” 4 layers in trigger order (see Â§10), plus the
`auth:expired` event that `callApi` fires on RLS/JWT failures (codes
`42501`, `PGRST301/302`, /jwt expired/i) and `useAuth` handles by signing out.

**Offline path** â€” `sw.js` cache-first shell + `/assets`, network-only
`/api` + `/functions`; bump the `CACHE` name on every shell-changing release
(docs must not quote the current value). CSP in `index.html` allowlists self
scripts, Google Fonts, and `*.supabase.co` (HTTP+WSS) only.

**Modal opener map** (who opens what):

| Page          | Opens                                                                             |
| :------------ | :-------------------------------------------------------------------------------- |
| Dashboard     | `addCustomer`, `addImport`, `addAdj`, `addPause`, `addBrand`, Generate Bills      |
| Customers     | `editCustomer` (full entity), `addSubscription` (prefilled customer id)           |
| Subscriptions | `addSubscription` (`NEW_SUB_DEFAULTS`), `editSubscription`, `subscriptionHistory` |
| Delivery      | `addAdHoc`                                                                        |
| Imports       | `addImport` (add _and_ edit via same modal), `addBrand`, `editBrand`              |
| Billing       | `payment`, `billDetail`, `addCreditNote`                                          |
| More          | `addAdj`, `addPause`, `changePin`                                                 |

`MODAL_RENDERERS` keys: `addCustomer`, `editCustomer`, `addImport`, `payment`,
`changePin`, `billDetail`, `addAdj`, `addPause`, `addBrand`, `editBrand`,
`addAdHoc`, `addCreditNote`, `subscriptionHistory`, `addSubscription`,
`editSubscription`. 12 modal components; `CustomerModal` serves add+edit,
`BrandModal` serves `addBrand`+`editBrand`, `SubscriptionModal` serves
`addSubscription`+`editSubscription`, `ImportModal` serves add+edit of imports.

**UI design system** ("Ledger", 2026-11 rebuild):

- `index.css` owns everything: light + dark token blocks on `:root`/`.dark`,
  then primitives, shell, modal, login, and per-page helpers. Tokens are CSS
  variables (`--brand-500`, `--bg-surface`, `--text-primary`, â€¦); pages never
  hardcode hex except inside `var(x, fallback)` pairs.
- Theme: a stored `darkMode` preference always wins; with no stored value the
  OS `prefers-color-scheme` decides. `public/apply-dark-mode.js` applies the
  class before first paint; `AppShell` is the toggle source of truth and keeps
  the `<meta name="theme-color">` in sync.
- Visual language: warm-paper light theme / ink dark theme, one pine-green
  accent, 1px hairline borders, 4–8px radii. IBM Plex Sans for UI, IBM Plex
  Mono for labels/numbers/money/dates. No gradients, glass, glow, ambient
  decoration, or emoji in product chrome — icons are lucide only.
- Layout: `.bottom-nav` is the single nav element — CSS switches it between a
  mobile bottom bar (2px active underline) and a desktop left rail (2px pine
  rule on the active item); `.page-stack`/`.control-bar`/`.stat-grid`/`.list`/
  `.row` are the page building blocks. Lists read as continuous divided
  panels and stat tiles form one ruled KPI strip.
- Pages render **state**, not derivation: search/sort/filter inputs live in
  `useFilterState`, flow through the pure filters in `lib/filters.js`, and are
  computed once in `useAppDerived` (bills: `billSearch` + `billSort` +
  `filterBills(bills, status, search, customerNames, sort)`). Pages must not
  re-filter, re-sort, or aggregate shared data locally — shared aggregations
  live in `lib/breakdowns.js` (brand Ã— type stock/qty math used by Delivery
  and Imports).
- Hydration: `useEntityStore` exposes `coreLoading` / `dateLoading` /
  `loading` so pages show skeletons during the first fetch instead of a false
  "no data" empty state. Manual refreshes and date changes do NOT re-raise
  the flags (no skeleton flash over live rows).
- Modals render their actions in `Modal`'s `footer` slot; forms keep the
  single curried-event contract (`onChange(key)(event)`) and every e2e
  selector (placeholders, aria-labels, field order in `ImportModal`).
- Accessibility bar: Lighthouse must stay at 1.0/1.0/1.0 on the login screen
  (contrast tokens `--text-muted` etc. are calibrated for 4.5:1; login renders
  a `<main>` landmark; `public/robots.txt` opts out of indexing).

## Architecture rules â€” please follow

### 1. All data ops go through `callApi(action, payload)` in `src/lib/api.js`

There is **no** REST backend. `callApi` looks the action up in the `DISPATCH`
table (a plain object) and delegates to a per-domain function under
`lib/api/`. New endpoint = a new exported function in the right domain file
**and** a new entry in the DISPATCH table. **Never** call
`supabase.from(...)`/`supabase.rpc(...)` from a component, page, or handler.
Supabase Auth calls in `useAuth.js` are the narrow exception (and
`api/admin.js#rotatePIN` re-authenticates before `updateUser`).

Action names are CamelCase strings (`getCustomers`, `recordPayment`,
`generateDailyLogsForDate`, â€¦). Unknown actions throw
`Unknown action: <name>` (after a console.warn) â€” silent success is
impossible. Current table: **39 registered actions** across 7 domains, of
which `rolloverMonth` is **registered but intentionally not wired to any UI**
(future feature) â€” do not assume a registered action has a caller.
(`getDailyInventory` was wired to the Imports page "By day" stock card on
2026-11-10, with Confirmed-only import counting.)

### 2. State composition pattern (don't break it)

See the map above. If you add new state, add it to the right hook in the
chain, not at the top. Never reference a local hook result before its
declaration â€” bundling may succeed while the app crashes at runtime from the
temporal dead zone. Derived state is computed **once** in `useAppDerived`
(stable `EMPTY_ARRAY` defaults keep the memo valid); pages must not recompute
or re-filter.

### 3. Handlers reuse `useHelpers()`

All handler hooks share `useHelpers(state)` from `handlers/shared.js`:

- `showToast(msg, type)`
- `executeApiAction(action, payload, successMsg, getList, setList, mapFromApi, resKey)`
  â€” mutation and list refetch are separate failure domains: a failed READ
  after a successful WRITE warns ("Saved â€” but the list refresh failed")
  instead of erroring, and still returns `true` (2026-11-21 audit â€” the old
  green-then-red double toast).
- `handleFormAction(action, formArg, successMsg, mapToApi, getList, setList, mapFromApi, resKey)`
- `saveWithValidation(formArg, validateFn, handlers, entityName)` â€” routes to
  `handlers.add<Entity>` / `handlers.update<Entity>` based on `form.id`

(`handleIdAction` was REMOVED in the 2026-11-21 audit â€” it was dead in
production and its unscoped `callApi(getList, {})` refetch would have
corrupted month-scoped `bills` state if ever reused.)

Arguments are **positional**: `getList` is an action string such as
`"getCustomers"`, `resKey` is the response key such as `"customers"`. Check
every UI callback contract: if a page passes an ID, the handler accepts an
ID; if it needs the full entity/version, pass the full entity explicitly.

Each user action calls its mutation **exactly once** and shows **at most one
success toast**. Copy/paste leftovers that invoke the same action twice are
release blockers.

### 4. API â†” UI shape mapping

DB `snake_case` â†” UI `camelCase`, converted exactly once in
`lib/api/mappers.js`. Mappers are defensive (`toNum`, `!!`, `toArray`) and
preserve legitimate `version = 0` (`?? 1`, not `|| 1`). Do not sprinkle
snake_case reads in pages or camelCase writes in the switch.

Map every row **exactly once**. Before mapping a response in a store or
handler, inspect the corresponding `callApi` case to see whether it already
returns UI shape (e.g. `getBills` pre-maps; `getDailyLogs` does not).
Double-mapping silently turns fields like `custId`/`paid` into
`undefined`/`0`. Add a regression test for the returned shape when changing a
mapper. Known deprecations: `customers.product`/`daily_qty`/`delivery_days`
are legacy â€” only `mapCustomerToApi` identity fields are written; `bills` has
**no** `due_date` (dropped deliberately â€” do not silently reconnect).

### 5. Optimistic concurrency control (OCC)

`customers`, `milk_imports`, `bills`, `subscriptions`, `adjustments`, and
`credit_notes` carry `version INT` (confirm in `database.types.ts`; do not
invent version fields elsewhere). `updateWithVersion(table, id,
expectedVersion, patch)` performs compare-and-set (`.eq("version", ev)` +
`.eq("id", id)`), sets `version: ev + 1`, and throws a typed `CONFLICT`
("changed elsewhere") on `PGRST116`. Always pass the version through update,
lock, unlock, confirm, deactivate, and delete paths.

A versioned mutation must verify **exactly one row** was affected â€” a
Supabase response can be error-free while matching zero rows. Delete paths
use `{ count: "exact" }` (see `deleteSubscription`) with a verification-select
fallback.

### 6. JSONB array columns

`customers.delivery_days` (legacy) and `subscriptions.delivery_days` are JSONB
integers `[0..6]`, `0 = Sun` (matches `DAYS` in constants.js). `toArray()`
in `lib/api/shared.js` normalizes array / JSON string / comma string. Always
`JSON.stringify()` on write.

### 7. Status strings (PascalCase â€” match DB)

Statuses are compared literally (the color palette lives in
`components/ui.jsx`; there is no `SC` export in `constants.js`):
`Active`, `Paused`, `Inactive`, `Draft`,
`Confirmed`, `Paid`, `Unpaid`, `Partial`, `Pending`, `Failed`, `Dead`,
`Reconciled`, `Applied`, `Delivered`, `Skipped`. **Don't** use `"paid"` /
`"PAID"` â€” comparisons are literal and filtering silently fails. `bills.status`
is constrained to `Draft`/`Unpaid`/`Partial`/`Paid` (`chk_bills_status_valid`);
`pendingDues` excludes `Paid` and `Draft`.

### 8. Currency and dates

- `fmt(n)` â†’ `â‚¹1,234.56` (en-IN, 2 decimals, null-safe); `toNum` for coercion
- `getToday()` / `getDaysAgoIST()` are **Asia/Kolkata** â€” never
  `new Date().toISOString().slice(0,10)`; `dayOfWeekKolkata(date)` for DOW
- `cleanPhone(p)` strips non-digits; WhatsApp prepends `91` for 10 digits
- Months are `YYYY-MM`; validate the 1..12 range (see `rolloverMonth`)

### 9. Auth model

- Authentication is **Supabase Auth** â€” not the `settings` table, not a
  custom PIN-hash/token RPC.
- The 6-digit operator PIN is the Auth **password** of the confirmed operator
  account. Email is centralized as `OPERATOR_EMAIL` in `constants.js`
  (env-overridable via `VITE_OPERATOR_EMAIL`; default
  `astamaniac001@gmail.com`). Its `auth.uid()` must be seeded into
  `operators` for `is_operator()` RLS and SECURITY DEFINER authorization.
  Never hardcode the email a second time.
- `useAuth.js` validates the persisted session with `getUser()` (network
  round-trip) before trusting `getSession()`, listens to
  `onAuthStateChange`, and signs out on the `auth:expired` event. Auth
  failures must terminate loading â€” never a permanent spinner. EXCEPTION
  (2026-11-21 audit): a NETWORK-level `getUser()` failure (offline) falls
  back to a valid, UNEXPIRED persisted session in degraded mode instead of
  dead-ending on the login screen â€” login itself needs network, so the old
  behavior made the installed PWA unusable offline.
- The operator email for e2e/live suites resolves through
  `e2e/_operator.mjs` (env-overridable via `E2E_OPERATOR_EMAIL`) â€” that file
  and `constants.js` are the only two places the address appears.
- PIN rotation (`api/admin.js#rotatePIN`) re-authenticates with the current
  PIN, then `supabase.auth.updateUser({ password })`. Never store or compare
  PINs in public tables.
- The anon key is public by design; security lives in RLS + RPC
  authorization. Do not weaken rate limiting or add bypass paths. Never log
  PINs, passwords, sessions, or access tokens. Missing env â†’ lazy client +
  `configError` surfaced on the login screen (no module-eval throw).

### 10. Error layers (in trigger order)

1. `safeFetch` (`useEntityStore`) â€” non-fatal initial-load failures append to
   `loadErrors[]` â†’ top banner with Retry.
2. `useBusy` â€” swallows re-entrant calls (no toast) and strips React
   SyntheticEvents from args; custom async wrappers must follow this pattern
   or DOM events reach API mappers.
3. Handler `try/catch` â€” `showToast(e.message, "error")`.
4. `ErrorBoundary` (class) â€” wraps the app subtree **and** the login screen;
   Reload / Sign-out-&-reload card. "Sign out & reload" performs a REAL
   `supabase.auth.signOut()` (best-effort), flushes the legacy `token` from
   both storages AND any `sb-*` session keys â€” the 2026-11-21 audit found
   the old token-only flush left the live session in localStorage, so the
   operator stayed signed in after reload.

Cross-cutting typed error codes to preserve/extend: `CONFLICT`, `LOCKED`,
`OVERPAY`, `ALREADY_APPLIED`, `NOT_FOUND`, `AUTHZ`, `INVALID_CURRENT_PIN`,
`auth:expired`.

### 11. Modal and page routing

- `PAGE_RENDERERS` in `AppPage.jsx`:
  `{ dashboard, customers, subscriptions, delivery, imports, billing, more }`.
- `MODAL_RENDERERS` in `AppModals.jsx`: the 15 keys listed in the map above.
- To add a page: add to `TABS` in `AppShell.jsx` **and** add a
  `renderX(state, handlers, derived)` + entry in `PAGE_RENDERERS`.
- To add a modal: create the component (or extend an existing add/edit
  component), add a renderer + key in `MODAL_RENDERERS`. Edit paths must pass
  the full entity (id + version) as modal data; `SubscriptionModal`'s save
  spreads `modal.data` first so a sparse form can't erase the edit target.

### 12. Lint and conventions

- `no-console` is `warn` (warn/error allowed). Unused **args** prefixed `_`
  are ignored (`argsIgnorePattern`) â€” that's args, not all vars.
- New files under `lib/validation/` must be re-exported from
  `lib/validation.js`.
- Inline styles dominate (`AppShell`, `Dashboard`, `Delivery`) â€” match that
  style; don't introduce CSS modules.
- CSS classes live in `src/index.css` (`.field`, `.input`, `.btn-*`, `.card`,
  `.modal-overlay`, `.toast`, `.bottom-nav`, â€¦) â€” keep names aligned.
- Defaults use canonical constants (`"Full Cream"` via `MILK_TYPES` /
  `NEW_SUB_DEFAULTS`), never ad-hoc spellings.
- e2e files have their own ESLint block (node globals; `no-console` off).

### 13. RLS is the security boundary

The browser holds the public anon key; authorization must be correct in
PostgreSQL. Treat every authenticated non-operator as hostile.

- Current posture (verified in `schema.sql`): every table has
  `strict_auth_only_select/insert/update/delete` policies gated on
  `is_operator()`; `operators` has `operators_service_role_only`
  (`USING (false) WITH CHECK (false)`). All RPCs are `REVOKE ALL FROM PUBLIC`
  â€” `authenticated` retains EXECUTE only via `ALTER DEFAULT PRIVILEGES`
  (functions are granted to `postgres`/`authenticated`/`service_role`, **not
  `anon`**).
- Grants to `authenticated` are PLAIN CRUD (`SELECT/INSERT/UPDATE/DELETE`)
  since the 20261121205118 migration â€” `GRANT ALL` includes `TRUNCATE`
  (which RLS cannot restrict) plus `REFERENCES`/`TRIGGER`, so `ALL` on a
  table is a privilege-escalation waiting for the first non-operator
  signup. Never re-introduce table-level `GRANT ALL` for `authenticated`;
  future tables start at CRUD via `ALTER DEFAULT PRIVILEGES`.
- Permissive policies combine with **OR**: adding an operator-only policy does
  not restrict an existing `USING (true)` policy. Restrictive work must
  drop/replace broad policies in the same migration.
- Review every policy for SELECT/INSERT/UPDATE/DELETE, both `USING` and
  `WITH CHECK`.
- Don't hardcode a production Auth UUID without documenting the coupling and
  a replacement procedure.
- Never grant financial/mutating RPCs to `anon`. A `SECURITY DEFINER`
  function must set a safe `search_path`, authorize the caller (`is_operator()`
  or equivalent), validate inputs, and expose minimal grants. Never use it to
  bypass broken RLS. RLS and function grants are separate controls â€” test an
  authenticated non-operator **and** an anonymous caller.

### 14. Financial mutations must be atomic

A client-side select â†’ calculate â†’ update â†’ insert is not atomic. Money
operations (payments, bill generation, adjustments, credit notes, ad-hoc
accrual, import confirm/delete, brand+rates, rollover) live in one
PostgreSQL function per operation, called through one `callApi` action:

- `FOR UPDATE` row locks; validate ownership, locked status, amount bounds,
  state transitions, and customer matching **inside** the transaction.
- Real UUID idempotency keys for retryable writes, uniqueness enforced in the
  DB (`payments.idempotency_key` UNIQUE). Same key â†’ original success, no
  double money. Key lifecycle is the caller's job: mint per distinct user
  attempt, reuse on retry of that attempt â€” minting inside the mapper was a
  bug that double-charged (fixed in `useBillPayments` via a
  (billId, amount)-scoped ref).
- Bill + ledger row move together; never update `amount_paid` without a
  payment/credit record. Adjustment sign semantics defined once (apply =
  reduce outstanding).
- Financial tests must cover success, duplicate retry, overpayment, locked
  bill, wrong customer, stale/concurrent update, rollback after forced
  failure.

### 15. RPC and schema contracts

- Compare every argument and column against `database.types.ts` +
  `schema.sql` before creating/calling an RPC. Payload keys must match
  parameter names exactly; dates are `YYYY-MM-DD`; UUIDs are real UUIDs.
- PostgreSQL functions overload by signature: `CREATE OR REPLACE` with new
  args creates a _new_ function. Drop obsolete overloads in a migration and
  confirm generated types show only the intended signature (the 5-arg
  `record_ad_hoc_log_rpc` was dropped once already).
- Don't leave legacy write RPCs callable as alternate paths around
  validation/idempotency/ledger/OCC rules.
- After `db:sync`, review generated artifacts for duplicate functions, stale
  grants, invalid triggers, and permissive policies.

### 16. UI callback and form contracts

- One field-change contract per form: curried `onChange(key)(event)` or
  direct `onChange(key, value)` â€” never mix.
- Form field names must match mapper inputs (`qty`, not `quantity`; import
  forms use `brand`/`type`/`rate` â€” the mapper translates).
- Editing passes the full entity (id + version) into modal state; opening a
  modal without data must not erase the edit target.
- Context properties must exist â€” don't pass `ctx.showToast`/`ctx.setForm`
  unless exposed (handlers/state spread defines the actual surface).
- Add interaction tests for destructive buttons, modal save paths, and
  callback argument shape â€” static diagnostics can't catch ID-vs-object
  mismatches.

### 17. Validation is evidence, not proof

- `npm run build` proves bundling only. It misses hook-order errors, broken
  callbacks, bad Supabase contracts, RLS mistakes.
- Mount `<App />` (or the affected state hook) in tests after changing
  composition, auth, or modal wiring.
- Mocked tests prove the mocked contract only; DB RPC/RLS changes need
  integration checks against a disposable/local Supabase environment when
  available.
- Never label a release production-ready because `check-all` passed. Report
  exactly which commands ran and what they include/omit.

### 18. Brand-aware subscriptions and pricing

A subscription is (customer, **brand**, milk type, qty, delivery days); each
brand prices each milk type independently.

- `brand_rates (brand_id, milk_type, rate_per_liter)` is the rate table â€”
  `UNIQUE (brand_id, milk_type)`, `CHECK rate_per_liter > 0` (NOT VALID until
the operator validates legacy rows â€” 2026-11-21 migration), operator-only
RLS. The
  legacy `milk_brands.default_milk_type`/`rate_per_liter` columns exist and
  are kept in sync by `save_brand_rpc` (they drive the NULL-brand pricing
  fallback) â€” never use them as the rate source for a branded delivery.
- `subscriptions.brand_id` is required by the UI (`validateSubscriptionForm`);
  one active sub per (customer, brand, milk type) via partial unique
  `uniq_sub_customer_brand_type_active` with `COALESCE(brand_id, '0000â€¦')` â€”
  NULL-brand rows stay distinct; same type from different brands is allowed.
- `daily_logs` identity is `(customer_id, date, brand_id, product)`; plain
  UNIQUE for PostgREST `onConflict` inference + expression index
  `uniq_daily_logs_cust_date_brand_product_nullsafe` for NULL coverage.
  Brandless rows update in place, never duplicate. In `bulkUpsertLogs`,
  brandless rows bypass the upsert (NULL never matches a unique index) and
  are found-then-updated-or-inserted instead.
- **Billing**: `generate_month_bill_rpc` groups delivered logs by (product,
  brand) and prices each pair at that brand's rate. Branded delivery with no
  matching rate **fails loudly** naming brand + type â€” never priced with
  another brand's rate. Only NULL-brand deliveries use the legacy heuristic
  (most recent Active brand whose `default_milk_type` matches).
- **Ad-hoc**: `record_ad_hoc_log_rpc` â€” 7 args (the 6-arg pre-2026-11-21
  overload was DROPPED in 20261122050800: PostgREST cannot disambiguate a
  prefix-overload pair, so keeping it broke every 6-arg call â€” the single
  7-arg function's `p_client_key DEFAULT NULL` covers old call shapes):
  `(p_customer_id, p_date, p_qty, p_product, p_brand_id, p_reason, p_client_key)`.
  `p_client_key` is the retry-idempotency token for an ACCUMULATING write
  (audit 2026-11-21: a network retry after a lost response double-counted
  liters): the caller mints a UUID per submit attempt, reuses it on retry of
  that attempt, and consumes it after a definitive response â€” the same
  lifecycle as the payment key. The token is stored in
  `daily_logs.client_key` (partial unique index, NULLs exempt). Accumulates
  onto the same-brand row
  (`brand_id IS NOT DISTINCT FROM p_brand_id` â€” NULL matches NULL). In
  plpgsql, test `FOUND` after `SELECT â€¦ INTO` â€” a record's `IS NOT NULL` is
  FALSE when _any_ field is NULL (this silently broke brandless accumulation
  once).
- **Brand save**: `save_brand_rpc(p_brand jsonb, p_rates jsonb)` â€” atomic
  brand upsert + replace-all rates; `BrandModal` is the only writer; the
  frontend never writes `brand_rates` directly; a brand with zero rates is
  rejected client-side (â‚¹0 pricing trap), and since the 2026-11-21
  migration the RPC and the `brand_rates` CHECK enforce `rate > 0` too â€”
  free milk must be an explicit pricing decision, never a forgotten rate.
- Frontend: brand selects store the **brand id** â€” `ActiveBrandOptions` with
  `valueKey="id"`; `mapSubscriptionFromApi`/`mapLogFromApi` expose `brandId`;
  `brandLabel(record, brands)` resolves display names (falls back to milk
  type for legacy rows); `matchBrandByMilkType` powers legacy pricing display.

### 19. Docs are part of the change

`README.md` and this file describe the working tree, not intent. When a
change alters behavior, update **both** in the same commit. Verify claims
against code; never quote mutable values (e.g. the service-worker cache name)
â€” describe the rule instead; never cite `schema.sql` line numbers (they
drift) â€” reference objects by name.

## Common workflows

### Add a new entity

1. `npm run db:new <descriptive_name>`; write table + constraints + indexes +
   RLS + grants + RPCs in the new migration. Start with
   `REVOKE ALL ON FUTURE TABLES IN SCHEMA public FROM anon` (Â§13 trap).
2. `supabase db push`, then `npm run db:sync`; review generated artifacts.
3. `mapXFromApi` (+ `mapXToApi` if writable) in `lib/api/mappers.js`; re-export
   from `lib/api.js` if a caller needs it.
4. State + setter in `useEntityStore` (initial `[]`, add to the
   date-independent `Promise.all` unless date-dependent).
5. DISPATCH entry in `lib/api.js` (at minimum `getX`).
6. Handler hook `hooks/handlers/useXHandlers.js` + spread in
   `useAppHandlers.js`.
7. Page/modal registration (Â§11) + tests for the full UI â†’ handler â†’ API
   contract.

### Debug a failing action

- `console.warn` breadcrumb trail â€” `useHelpers` logs every step in DEV.
- `loadErrors` banner at the top of `AppShell`.
- Login broken â†’ check Supabase Auth for the confirmed `OPERATOR_EMAIL`
  account; never inspect/store a PIN in `settings`.
- Stale UI after a deploy â†’ service-worker cache: bump the `CACHE` constant
  in `public/sw.js` (the shell is cache-first).

### Run all checks

```bash
npm run check-all      # OFFLINE gate: lint → test → build (never touches Supabase)
npm run check-all:live # + test:db - MUTATES the linked project; run deliberately
npm run test:coverage  # enforced thresholds; run and report separately
npm run advisor-all    # spellcheck â†’ check-deps â†’ fallow â†’ test:coverage
npm run test:e2e       # browser e2e (Edge channel)
```

Other advisory scripts: `audit`, `circular`, `cprettier`, `check-deps`,
`fallow`, `spellcheck`. Inspect `package.json` before describing what an
aggregate runs â€” a check that is not in the script did not run. Do not weaken
thresholds or remove checks to make a gate green.

## Environment

`.env` is git-ignored â€” each operator keeps a local copy; it is the source of
truth for dev and the local Playwright/Vitest suites; production reads the
same vars from the hosting provider.

Required:

- `VITE_SUPABASE_URL` â€” e.g. `https://qipvmrgieuvpygjytcpt.supabase.co`
- `VITE_SUPABASE_ANON_KEY` â€” public anon JWT; public by design (Â§9)

Optional:

- `VITE_OPERATOR_EMAIL` â€” overrides the default operator email
- `E2E_OPERATOR_PIN` / `E2E_OPERATOR_EMAIL` â€” e2e + live-DB tests
  (self-skip when unset; see `e2e/README.md`)

Both `VITE_*` vars are read once in `src/lib/supabaseClient.js`. Missing env
= lazy client = `configError` on the login screen (no crash). Don't add env
vars without a guard there.

## Things to be careful about

- **Coverage is thin** (global 10%; floors: `api.js` 40/30, `validation/**`
  50/50, `handlers/**` 30/20). Add tests when changing `lib/`, handlers,
  auth, state composition, or modal wiring â€” don't assume the suite
  exercises a changed path.
- **`useBusy` filters SyntheticEvents** â€” custom async wrappers must do the
  same or re-entry passes DOM events into mappers.
- **`version` is the frontend OCC guard** â€” skipping it on an update path
  lets concurrent tabs silently overwrite each other. Financial RPCs
  additionally require transactional row locks.
- **Toast timer is tracked by id** (`useAppUi.toast$`) â€” don't replace it
  with a naive `setTimeout` (leaks + stale toasts).
- **`generateDailyLogsForDate` runs four parallel queries** then batched
  upserts; don't refactor to a sequential loop (kills the Generate button).
- **`bills` refetches are month-scoped** (`getBills { month: billMonth }`) â€”
  an unscoped refetch overwrites `state.bills` with every month and corrupts
  the Billing KPIs.
- **Payments patch state locally** from the RPC result (`setBills(prev => â€¦)`)
  â€” no redundant full-month refetch (it produced double toasts on failure).
- **Service worker: never cache `/api` or `/functions`** â€” security fix baked
  into the SW; bump `CACHE` per shell change (Â§19: don't quote the value).
- **CSP in `index.html`** â€” new external origins (fonts, APIs) must be
  allowlisted there; scripts stay classic or self-hosted modules.
- **DEFAULT PRIVILEGES no longer grant TABLES + SEQUENCES to `anon`** â€” the
  20261108185027 migration revoked them (and revoked `update_updated_at_column()`
  from PUBLIC). Since 20261121205118 they grant CRUD (not ALL) to
  `authenticated` for TABLES and `USAGE/SELECT` for SEQUENCES. New tables
  start closed: a migration that creates a table must grant explicitly to
  `authenticated`/`service_role` in the same migration, and RLS must be
  enabled + forced before any grant lands (Â§13).

## ðŸ—„ï¸ Database migrations & schema context

### AI agent context rules (strict)

**DO NOT** read historical migrations to infer the current database â€” they
contain superseded columns, policies, grants, and function definitions.

Use only the present-state artifacts for discovery:

1. `supabase/schema.sql` â€” compiled tables, constraints, policies, grants,
   functions, triggers.
2. `src/lib/database.types.ts` â€” generated columns, relationships, RPC
   signatures; the primary contract for frontend code.

`supabase/migrations/` is a historical ledger (it exists since the 2026-11
baseline); the generated artifacts remain the discovery source. The only
migration **you create during the current task** may be edited; never inspect
older ones for context. Review the generated artifacts after applying.

### Migration workflow rules (humans & AI)

1. **Never use the Supabase Table Editor UI.** Every schema change is SQL.
2. `npm run db:new <descriptive_name>`; never modify a committed or deployed
   migration.
3. Verify columns, RPC signatures, policy names, grants against the generated
   artifacts **before** writing the migration.
4. Apply with `supabase db push` (or `npm run db:push`). No dashboard pasting
   unless the user explicitly requests an emergency hotfix.
5. Wrong after applying â†’ a new corrective migration; never rewrite history.
6. `npm run db:sync` after pushing; never hand-edit `schema.sql` or
   `database.types.ts`.
7. Review the regenerated artifacts for stale overloads, permissive policies,
   grants to `anon`, invalid triggers, missing constraints, type drift.
8. Commit the migration + both regenerated artifacts together.

