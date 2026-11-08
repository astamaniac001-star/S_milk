# AGENTS.md — S_milk / c1milk

> Single source of truth for AI agents working in this repo. Read this first.
>
> **Accuracy rule:** verify claims against the current working tree. A passing
> build, an audit comment, or a commit message is not proof that behavior is
> correct. Generated database artifacts describe the deployed schema;
> historical SQL does not.

This document is a complete, standalone description of the project — what it
is, how every layer connects, and the rules for changing it. The human-facing
twin with the same depth lives in [`README.md`](./README.md); keep both in
sync (§19).

---

## What this app is

**Milk Delivery Admin** — an internal PWA for a small milk-delivery business
in India. One operator, from a phone, uses it to:

- Manage customers (identity only) and their **brand-aware** delivery subscriptions
- Record which customers got milk / were skipped each day, plus ad-hoc extras
- Track milk purchases from brands/suppliers ("imports") and manage per-brand rates
- Generate and collect monthly bills (lock/unlock, payments, WhatsApp share)
- Handle adjustments, credit notes, pause periods, and month rollover (manual)

It's **not** a customer-facing app: single-operator, installable PWA, offline-tolerant.

## Tech stack (verified against package.json)

| Layer      | Choice | Notes |
| :---       | :---   | :---  |
| UI         | React 19.2 + Vite 8.1 | JSX, no TypeScript; build target es2020, no prod sourcemaps |
| Icons      | lucide-react 1.24 | |
| Backend    | **Supabase directly** (no Node server) | `@supabase/supabase-js` 2.110; PostgREST 14.5 |
| Service Wk | Vanilla `public/sw.js` | Cache-first shell; network-only for `/api` + `/functions` |
| State      | React hooks (no Redux/Zustand) | Composable custom hooks |
| Routing    | Tab-based (no react-router) | State field `tab` in `useAppUi` |
| Tests      | Vitest 4 + jsdom 29 + Testing Library; Playwright 1.62 (browser e2e) | Coverage thresholds enforced separately |
| Lint       | ESLint 10 flat config + react-hooks + react-refresh | `no-console` warn (warn/error allowed) |
| Other      | cspell, fallow, madge, prettier, depcheck | Advisory; not all are in `check-all` |

## Repository layout

```
src/
├── main.jsx                 # Mounts <App/> into #app-root (React.StrictMode)
├── App.jsx                  # Auth gate → ErrorBoundary → Shell + Page + Modals + Toast
├── index.css                # All form/shell classes (.field, .input, .btn-*, .card, .modal-overlay, .toast, .bottom-nav)
├── lib/
│   ├── supabaseClient.js    # Single lazy `supabase` instance + configError (no module-eval throw)
│   ├── api.js               # 🔑 callApi(action, payload) — barrel + DISPATCH table (39 actions)
│   ├── api/                 # Per-domain implementations
│   │   ├── mappers.js       # mapXFromApi / mapXToApi (DB snake_case ↔ UI camelCase)
│   │   ├── shared.js        # toArray, updateWithVersion, must, isAuthError, AuthzError, dayOfWeekKolkata
│   │   ├── customers.js     # getCustomers, addCustomer, updateCustomer, deactivateCustomer
│   │   ├── subscriptions.js # rolloverMonth, getSubscriptions, saveSubscription, deleteSubscription, getSubscriptionHistory
│   │   ├── delivery.js      # getDailyLogs, updateLogEntry, bulkUpsertLogs, generateDailyLogsForDate, addAdHocLog
│   │   ├── billing.js       # getBills, lockBill, unlockBill, recordPayment, generateMonthBill, getBillText
│   │   ├── adjustments.js   # get/add/applyAdjustment, get/add/applyCreditNote
│   │   ├── imports.js       # milk_imports CRUD + confirm/delete RPCs + getBrands + saveBrand + getDailyInventory
│   │   └── admin.js         # getPauses, addPausePeriod, runDiagnostics, healthCheck, rotatePIN
│   ├── constants.js         # SC (status colors), DAYS, MILK_TYPES (7), PAY_MODES (7), NEW_SUB_DEFAULTS, OPERATOR_EMAIL
│   ├── filters.js           # Pure filterCustomers/filterImports/filterBills + buildMonthOptions
│   ├── utils.js             # toNum, fmt, getToday [Asia/Kolkata], getDaysAgoIST, cleanPhone, dayLabels, matchBrandByMilkType, brandLabel, generateKey
│   ├── validation.js        # Barrel re-exporting validation/*
│   ├── validation/          # customer.js, import.js, subscription.js (validateSubscriptionForm)
│   └── database.types.ts    # Generated current Supabase types; never edit manually
├── hooks/
│   ├── useAuth.js           # Supabase Auth session + 6-digit operator PIN login
│   ├── useAppState.js       # Composition root: useDayTick → useAppUi → useFilterState → useEntityStore → useAppDerived
│   ├── useAppDerived.js     # Memoized: activeC, subsByCustomer, activeSubs, totalRevenue, pendingDues, filtered*, todayLogs, selectedDateLogs, confirmedStock
│   ├── useAppHandlers.js    # Spreads 6 domain handler hooks
│   ├── useBusy.js           # Re-entrancy guard; filters React SyntheticEvents from args
│   ├── useEntityStore.js    # 9 entity arrays + safeFetch + refresh + useFilterState
│   └── handlers/
│       ├── shared.js        # useHelpers(): showToast, executeApiAction, handleFormAction, handleIdAction, saveWithValidation
│       ├── useCustomerHandlers.js
│       ├── useBillingHandlers.js   # useBillPayments + useBillOperations
│       ├── useBillPayments.js      # recordPayment (idempotency-key lifecycle), adjustments, credit notes
│       ├── useBillOperations.js    # generateMonthlyBills, lockBill, unlockBill, whatsapp
│       ├── useImportHandlers.js
│       ├── useDeliveryHandlers.js
│       ├── useAdminHandlers.js     # Pauses + brands + diagnostics + health + PIN rotate
│       └── useSubscriptionHandlers.js
├── pages/                   # Dashboard, Customers, Subscriptions, Delivery, Imports, Billing, More (+ tests)
├── components/
│   ├── AppShell.jsx         # TABS (7), header, bottom nav, load-error banner, dark mode, online badge
│   ├── AppPage.jsx          # PAGE_RENDERERS: tab → page
│   ├── AppModals.jsx        # MODAL_RENDERERS: 15 modal types → components
│   ├── ErrorBoundary.jsx    # Class component — Reload / Sign-out & reload
│   ├── login.jsx            # 6-digit operator PIN form
│   ├── ui.jsx               # Badge, Toast, Modal, Btn, Field, Card, CardHeader, Empty, Section, StatGrid, ActiveBrandOptions (valueKey="id"), ActiveCustomerOptions
│   ├── forms.jsx            # Barrel re-exporting 11 modals from modals/
│   └── modals/              # 12 modal components (incl. shared.jsx); ChangePinModal imported directly
├── assets/                  # Static images (vite.svg, react.svg, hero.png)
└── test/setup.js            # Vitest + Testing Library setup (referenced from vite.config.js)

public/                      # sw.js (cache-first shell), register-sw.js, app.css,
                             # apply-dark-mode.js (early dark-mode strip), manifest.json, icons
supabase/
├── schema.sql               # Generated present-state schema; never edit manually
└── migrations/              # Created when migrations are added (currently absent);
                             # historical ledger once it exists — ignore for discovery
scripts/db-baseline.js       # db:baseline → <ts>_initial_schema.sql + <ts+1>_seed_data.sql
e2e/                         # Playwright + live-DB Vitest suites (see e2e/README.md)
```

Root config: `vite.config.js` (test+coverage+chunks), `eslint.config.js`,
`cspell.json`, `playwright.config.js`. `dist/`, `coverage/`,
`e2e-test-results/` are git-ignored artifacts.

## How the app works (the one-page map)

**Data path** — everything funnels through one door:

```
UI (pages + modals) → handlers (hooks/handlers/*) → callApi() [src/lib/api.js]
  → DISPATCH table → lib/api/<domain>.js → mappers.js → supabase-js
    → RLS / SECURITY DEFINER RPCs → PostgreSQL (13 tables, 9 RPCs)
```

**State path** — one composition root, never recompose in pages:

```
useAppState(auth)
  ├─ useDayTick()      — 60s tick + visibility/focus → `today` (midnight rollover)
  ├─ useAppUi()        — tab, toast (timer per id), modal, form, logDate, billMonth, setF
  ├─ useFilterState()  — custSearch/custFilter, subSearch/subFilter, impFilter, billFilter, diag*
  ├─ useEntityStore()  — 9 entity arrays; two fetch groups:
  │     date-independent (7 parallel reads: customers, imports, adjustments,
  │     pauses, brands, subscriptions, creditNotes — on login + refresh)
  │     date-dependent (getBills{month} + getDailyLogs{date} — on date/month change)
  └─ useAppDerived()   — single useMemo for all derived stats/filtered lists

useAppHandlers(state) → 6 domain hooks spread flat
```

**Error path** — 4 layers in trigger order (see §10), plus the
`auth:expired` event that `callApi` fires on RLS/JWT failures (codes
`42501`, `PGRST301/302`, /jwt expired/i) and `useAuth` handles by signing out.

**Offline path** — `sw.js` cache-first shell + `/assets`, network-only
`/api` + `/functions`; bump the `CACHE` name on every shell-changing release
(docs must not quote the current value). CSP in `index.html` allowlists self
scripts, Google Fonts, and `*.supabase.co` (HTTP+WSS) only.

**Modal opener map** (who opens what):

| Page | Opens |
| :--- | :---- |
| Dashboard | `addCustomer`, `addImport`, `addAdj`, `addPause`, `addBrand`, Generate Bills |
| Customers | `editCustomer` (full entity), `addSubscription` (prefilled customer id) |
| Subscriptions | `addSubscription` (`NEW_SUB_DEFAULTS`), `editSubscription`, `subscriptionHistory` |
| Delivery | `addAdHoc` |
| Imports | `addImport` (add *and* edit via same modal), `addBrand`, `editBrand` |
| Billing | `payment`, `billDetail`, `addCreditNote` |
| More | `addAdj`, `addPause`, `changePin` |

`MODAL_RENDERERS` keys: `addCustomer`, `editCustomer`, `addImport`, `payment`,
`changePin`, `billDetail`, `addAdj`, `addPause`, `addBrand`, `editBrand`,
`addAdHoc`, `addCreditNote`, `subscriptionHistory`, `addSubscription`,
`editSubscription`. 12 modal components; `CustomerModal` serves add+edit,
`BrandModal` serves `addBrand`+`editBrand`, `SubscriptionModal` serves
`addSubscription`+`editSubscription`, `ImportModal` serves add+edit of imports.

## Architecture rules — please follow

### 1. All data ops go through `callApi(action, payload)` in `src/lib/api.js`

There is **no** REST backend. `callApi` looks the action up in the `DISPATCH`
table (a plain object) and delegates to a per-domain function under
`lib/api/`. New endpoint = a new exported function in the right domain file
**and** a new entry in the DISPATCH table. **Never** call
`supabase.from(...)`/`supabase.rpc(...)` from a component, page, or handler.
Supabase Auth calls in `useAuth.js` are the narrow exception (and
`api/admin.js#rotatePIN` re-authenticates before `updateUser`).

Action names are CamelCase strings (`getCustomers`, `recordPayment`,
`generateDailyLogsForDate`, …). Unknown actions throw
`Unknown action: <name>` (after a console.warn) — silent success is
impossible. Current table: **39 registered actions** across 7 domains, of
which `rolloverMonth` and `getDailyInventory` are **registered but
intentionally not wired to any UI** (future features) — do not assume a
registered action has a caller.

### 2. State composition pattern (don't break it)

See the map above. If you add new state, add it to the right hook in the
chain, not at the top. Never reference a local hook result before its
declaration — bundling may succeed while the app crashes at runtime from the
temporal dead zone. Derived state is computed **once** in `useAppDerived`
(stable `EMPTY_ARRAY` defaults keep the memo valid); pages must not recompute
or re-filter.

### 3. Handlers reuse `useHelpers()`

All handler hooks share `useHelpers(state)` from `handlers/shared.js`:

- `showToast(msg, type)`
- `executeApiAction(action, payload, successMsg, getList, setList, mapFromApi, resKey)`
- `handleFormAction(action, formArg, successMsg, mapToApi, getList, setList, mapFromApi, resKey)`
- `handleIdAction(action, idKey, id, successMsg, getList, setList, mapFromApi, resKey, fallbackErrMsg)`
- `saveWithValidation(formArg, validateFn, handlers, entityName)` — routes to
  `handlers.add<Entity>` / `handlers.update<Entity>` based on `form.id`

Arguments are **positional**: `getList` is an action string such as
`"getCustomers"`, `resKey` is the response key such as `"customers"`. Check
every UI callback contract: if a page passes an ID, the handler accepts an
ID; if it needs the full entity/version, pass the full entity explicitly.

Each user action calls its mutation **exactly once** and shows **at most one
success toast**. Copy/paste leftovers that invoke the same action twice are
release blockers.

### 4. API ↔ UI shape mapping

DB `snake_case` ↔ UI `camelCase`, converted exactly once in
`lib/api/mappers.js`. Mappers are defensive (`toNum`, `!!`, `toArray`) and
preserve legitimate `version = 0` (`?? 1`, not `|| 1`). Do not sprinkle
snake_case reads in pages or camelCase writes in the switch.

Map every row **exactly once**. Before mapping a response in a store or
handler, inspect the corresponding `callApi` case to see whether it already
returns UI shape (e.g. `getBills` pre-maps; `getDailyLogs` does not).
Double-mapping silently turns fields like `custId`/`paid` into
`undefined`/`0`. Add a regression test for the returned shape when changing a
mapper. Known deprecations: `customers.product`/`daily_qty`/`delivery_days`
are legacy — only `mapCustomerToApi` identity fields are written; `bills` has
**no** `due_date` (dropped deliberately — do not silently reconnect).

### 5. Optimistic concurrency control (OCC)

`customers`, `milk_imports`, `bills`, `subscriptions`, `adjustments`, and
`credit_notes` carry `version INT` (confirm in `database.types.ts`; do not
invent version fields elsewhere). `updateWithVersion(table, id,
expectedVersion, patch)` performs compare-and-set (`.eq("version", ev)` +
`.eq("id", id)`), sets `version: ev + 1`, and throws a typed `CONFLICT`
("changed elsewhere") on `PGRST116`. Always pass the version through update,
lock, unlock, confirm, deactivate, and delete paths.

A versioned mutation must verify **exactly one row** was affected — a
Supabase response can be error-free while matching zero rows. Delete paths
use `{ count: "exact" }` (see `deleteSubscription`) with a verification-select
fallback.

### 6. JSONB array columns

`customers.delivery_days` (legacy) and `subscriptions.delivery_days` are JSONB
integers `[0..6]`, `0 = Sun` (matches `DAYS` in constants.js). `toArray()`
in `lib/api/shared.js` normalizes array / JSON string / comma string. Always
`JSON.stringify()` on write.

### 7. Status strings (PascalCase — match DB)

Per `SC` in `constants.js`: `Active`, `Paused`, `Inactive`, `Draft`,
`Confirmed`, `Paid`, `Unpaid`, `Partial`, `Pending`, `Failed`, `Dead`,
`Reconciled`, `Applied`, `Delivered`, `Skipped`. **Don't** use `"paid"` /
`"PAID"` — comparisons are literal and filtering silently fails. `bills.status`
is constrained to `Draft`/`Unpaid`/`Partial`/`Paid` (`chk_bills_status_valid`);
`pendingDues` excludes `Paid` and `Draft`.

### 8. Currency and dates

- `fmt(n)` → `₹1,234.56` (en-IN, 2 decimals, null-safe); `toNum` for coercion
- `getToday()` / `getDaysAgoIST()` are **Asia/Kolkata** — never
  `new Date().toISOString().slice(0,10)`; `dayOfWeekKolkata(date)` for DOW
- `cleanPhone(p)` strips non-digits; WhatsApp prepends `91` for 10 digits
- Months are `YYYY-MM`; validate the 1..12 range (see `rolloverMonth`)

### 9. Auth model

- Authentication is **Supabase Auth** — not the `settings` table, not a
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
  failures must terminate loading — never a permanent spinner.
- PIN rotation (`api/admin.js#rotatePIN`) re-authenticates with the current
  PIN, then `supabase.auth.updateUser({ password })`. Never store or compare
  PINs in public tables.
- The anon key is public by design; security lives in RLS + RPC
  authorization. Do not weaken rate limiting or add bypass paths. Never log
  PINs, passwords, sessions, or access tokens. Missing env → lazy client +
  `configError` surfaced on the login screen (no module-eval throw).

### 10. Error layers (in trigger order)

1. `safeFetch` (`useEntityStore`) — non-fatal initial-load failures append to
   `loadErrors[]` → top banner with Retry.
2. `useBusy` — swallows re-entrant calls (no toast) and strips React
   SyntheticEvents from args; custom async wrappers must follow this pattern
   or DOM events reach API mappers.
3. Handler `try/catch` — `showToast(e.message, "error")`.
4. `ErrorBoundary` (class) — wraps the app subtree **and** the login screen;
   Reload / Sign-out-&-reload card; sign-out flushes `token` from both
   storages.

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
  are ignored (`argsIgnorePattern`) — that's args, not all vars.
- New files under `lib/validation/` must be re-exported from
  `lib/validation.js`.
- Inline styles dominate (`AppShell`, `Dashboard`, `Delivery`) — match that
  style; don't introduce CSS modules.
- CSS classes live in `src/index.css` (`.field`, `.input`, `.btn-*`, `.card`,
  `.modal-overlay`, `.toast`, `.bottom-nav`, …) — keep names aligned.
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
  — `authenticated` retains EXECUTE only via `ALTER DEFAULT PRIVILEGES`
  (functions are granted to `postgres`/`authenticated`/`service_role`, **not
  `anon`**).
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
  bypass broken RLS. RLS and function grants are separate controls — test an
  authenticated non-operator **and** an anonymous caller.

### 14. Financial mutations must be atomic

A client-side select → calculate → update → insert is not atomic. Money
operations (payments, bill generation, adjustments, credit notes, ad-hoc
accrual, import confirm/delete, brand+rates, rollover) live in one
PostgreSQL function per operation, called through one `callApi` action:

- `FOR UPDATE` row locks; validate ownership, locked status, amount bounds,
  state transitions, and customer matching **inside** the transaction.
- Real UUID idempotency keys for retryable writes, uniqueness enforced in the
  DB (`payments.idempotency_key` UNIQUE). Same key → original success, no
  double money. Key lifecycle is the caller's job: mint per distinct user
  attempt, reuse on retry of that attempt — minting inside the mapper was a
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
  args creates a *new* function. Drop obsolete overloads in a migration and
  confirm generated types show only the intended signature (the 5-arg
  `record_ad_hoc_log_rpc` was dropped once already).
- Don't leave legacy write RPCs callable as alternate paths around
  validation/idempotency/ledger/OCC rules.
- After `db:sync`, review generated artifacts for duplicate functions, stale
  grants, invalid triggers, and permissive policies.

### 16. UI callback and form contracts

- One field-change contract per form: curried `onChange(key)(event)` or
  direct `onChange(key, value)` — never mix.
- Form field names must match mapper inputs (`qty`, not `quantity`; import
  forms use `brand`/`type`/`rate` — the mapper translates).
- Editing passes the full entity (id + version) into modal state; opening a
  modal without data must not erase the edit target.
- Context properties must exist — don't pass `ctx.showToast`/`ctx.setForm`
  unless exposed (handlers/state spread defines the actual surface).
- Add interaction tests for destructive buttons, modal save paths, and
  callback argument shape — static diagnostics can't catch ID-vs-object
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

- `brand_rates (brand_id, milk_type, rate_per_liter)` is the rate table —
  `UNIQUE (brand_id, milk_type)`, `CHECK rate >= 0`, operator-only RLS. The
  legacy `milk_brands.default_milk_type`/`rate_per_liter` columns exist and
  are kept in sync by `save_brand_rpc` (they drive the NULL-brand pricing
  fallback) — never use them as the rate source for a branded delivery.
- `subscriptions.brand_id` is required by the UI (`validateSubscriptionForm`);
  one active sub per (customer, brand, milk type) via partial unique
  `uniq_sub_customer_brand_type_active` with `COALESCE(brand_id, '0000…')` —
  NULL-brand rows stay distinct; same type from different brands is allowed.
- `daily_logs` identity is `(customer_id, date, brand_id, product)`; plain
  UNIQUE for PostgREST `onConflict` inference + expression index
  `uniq_daily_logs_cust_date_brand_product_nullsafe` for NULL coverage.
  Brandless rows update in place, never duplicate. In `bulkUpsertLogs`,
  brandless rows bypass the upsert (NULL never matches a unique index) and
  are found-then-updated-or-inserted instead.
- **Billing**: `generate_month_bill_rpc` groups delivered logs by (product,
  brand) and prices each pair at that brand's rate. Branded delivery with no
  matching rate **fails loudly** naming brand + type — never priced with
  another brand's rate. Only NULL-brand deliveries use the legacy heuristic
  (most recent Active brand whose `default_milk_type` matches).
- **Ad-hoc**: `record_ad_hoc_log_rpc(p_customer_id, p_date, p_qty, p_product,
  p_brand_id, p_reason)` — 6 args; accumulates onto the same-brand row
  (`brand_id IS NOT DISTINCT FROM p_brand_id` — NULL matches NULL). In
  plpgsql, test `FOUND` after `SELECT … INTO` — a record's `IS NOT NULL` is
  FALSE when *any* field is NULL (this silently broke brandless accumulation
  once).
- **Brand save**: `save_brand_rpc(p_brand jsonb, p_rates jsonb)` — atomic
  brand upsert + replace-all rates; `BrandModal` is the only writer; the
  frontend never writes `brand_rates` directly; a brand with zero rates is
  rejected client-side (₹0 pricing trap).
- Frontend: brand selects store the **brand id** (`ActiveBrandOptions
  valueKey="id"`); `mapSubscriptionFromApi`/`mapLogFromApi` expose `brandId`;
  `brandLabel(record, brands)` resolves display names (falls back to milk
  type for legacy rows); `matchBrandByMilkType` powers legacy pricing display.

### 19. Docs are part of the change

`README.md` and this file describe the working tree, not intent. When a
change alters behavior, update **both** in the same commit. Verify claims
against code; never quote mutable values (e.g. the service-worker cache name)
— describe the rule instead; never cite `schema.sql` line numbers (they
drift) — reference objects by name.

## Common workflows

### Add a new entity

1. `npm run db:new <descriptive_name>`; write table + constraints + indexes +
   RLS + grants + RPCs in the new migration. Start with
   `REVOKE ALL ON FUTURE TABLES IN SCHEMA public FROM anon` (§13 trap).
2. `supabase db push`, then `npm run db:sync`; review generated artifacts.
3. `mapXFromApi` (+ `mapXToApi` if writable) in `lib/api/mappers.js`; re-export
   from `lib/api.js` if a caller needs it.
4. State + setter in `useEntityStore` (initial `[]`, add to the
   date-independent `Promise.all` unless date-dependent).
5. DISPATCH entry in `lib/api.js` (at minimum `getX`).
6. Handler hook `hooks/handlers/useXHandlers.js` + spread in
   `useAppHandlers.js`.
7. Page/modal registration (§11) + tests for the full UI → handler → API
   contract.

### Debug a failing action

- `console.warn` breadcrumb trail — `useHelpers` logs every step in DEV.
- `loadErrors` banner at the top of `AppShell`.
- Login broken → check Supabase Auth for the confirmed `OPERATOR_EMAIL`
  account; never inspect/store a PIN in `settings`.
- Stale UI after a deploy → service-worker cache: bump the `CACHE` constant
  in `public/sw.js` (the shell is cache-first).

### Run all checks

```bash
npm run check-all      # lint → test:db → test → build
npm run test:coverage  # enforced thresholds; run and report separately
npm run advisor-all    # spellcheck → check-deps → fallow → test:coverage
npm run test:e2e       # browser e2e (Edge channel)
```

Other advisory scripts: `audit`, `circular`, `cprettier`, `check-deps`,
`fallow`, `spellcheck`. Inspect `package.json` before describing what an
aggregate runs — a check that is not in the script did not run. Do not weaken
thresholds or remove checks to make a gate green.

## Environment

`.env` is git-ignored — each operator keeps a local copy; it is the source of
truth for dev and the local Playwright/Vitest suites; production reads the
same vars from the hosting provider.

Required:
- `VITE_SUPABASE_URL` — e.g. `https://qipvmrgieuvpygjytcpt.supabase.co`
- `VITE_SUPABASE_ANON_KEY` — public anon JWT; public by design (§9)

Optional:
- `VITE_OPERATOR_EMAIL` — overrides the default operator email
- `E2E_OPERATOR_PIN` / `E2E_OPERATOR_EMAIL` — e2e + live-DB tests
  (self-skip when unset; see `e2e/README.md`)

Both `VITE_*` vars are read once in `src/lib/supabaseClient.js`. Missing env
= lazy client = `configError` on the login screen (no crash). Don't add env
vars without a guard there.

## Things to be careful about

- **Coverage is thin** (global 10%; floors: `api.js` 40/30, `validation/**`
  50/50, `handlers/**` 30/20). Add tests when changing `lib/`, handlers,
  auth, state composition, or modal wiring — don't assume the suite
  exercises a changed path.
- **`useBusy` filters SyntheticEvents** — custom async wrappers must do the
  same or re-entry passes DOM events into mappers.
- **`version` is the frontend OCC guard** — skipping it on an update path
  lets concurrent tabs silently overwrite each other. Financial RPCs
  additionally require transactional row locks.
- **Toast timer is tracked by id** (`useAppUi.toast$`) — don't replace it
  with a naive `setTimeout` (leaks + stale toasts).
- **`generateDailyLogsForDate` runs four parallel queries** then batched
  upserts; don't refactor to a sequential loop (kills the Generate button).
- **`bills` refetches are month-scoped** (`getBills { month: billMonth }`) —
  an unscoped refetch overwrites `state.bills` with every month and corrupts
  the Billing KPIs.
- **Payments patch state locally** from the RPC result (`setBills(prev => …)`)
  — no redundant full-month refetch (it produced double toasts on failure).
- **Service worker: never cache `/api` or `/functions`** — security fix baked
  into the SW; bump `CACHE` per shell change (§19: don't quote the value).
- **CSP in `index.html`** — new external origins (fonts, APIs) must be
  allowlisted there; scripts stay classic or self-hosted modules.
- **DEFAULT PRIVILEGES grant TABLES + SEQUENCES to `anon`** (and functions to
  `authenticated`/`service_role` but not `anon`). A migration that creates a
  table and forgets RLS exposes it publicly — `REVOKE ALL ON FUTURE TABLES …
  FROM anon` first, then per-table grants (§13).

## 🗄️ Database migrations & schema context

### AI agent context rules (strict)

**DO NOT** read historical migrations to infer the current database — they
contain superseded columns, policies, grants, and function definitions.

Use only the present-state artifacts for discovery:

1. `supabase/schema.sql` — compiled tables, constraints, policies, grants,
   functions, triggers.
2. `src/lib/database.types.ts` — generated columns, relationships, RPC
   signatures; the primary contract for frontend code.

`supabase/migrations/` is a historical ledger (the directory is currently
absent; it will exist once migrations are added). The only exception: a
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
5. Wrong after applying → a new corrective migration; never rewrite history.
6. `npm run db:sync` after pushing; never hand-edit `schema.sql` or
   `database.types.ts`.
7. Review the regenerated artifacts for stale overloads, permissive policies,
   grants to `anon`, invalid triggers, missing constraints, type drift.
8. Commit the migration + both regenerated artifacts together.
