# AGENTS.md — c1milk / S_milk

> Single source of truth for AI agents working in this repo. Read this first.
>
> **Accuracy rule:** verify claims against the current working tree. A passing build,
> an audit comment, or a commit message is not proof that behavior is correct.
> Generated database artifacts describe the deployed schema; historical SQL does not.

## What this app is

**Milk Delivery Admin (V17)** — an internal PWA for a small milk-delivery business
in India. The operator uses it to:

- Manage customers and their daily delivery schedules
- Record which customers got milk / were skipped each day
- Track milk purchases from brands/suppliers (imports)
- Generate and collect monthly bills (with WhatsApp share)
- Handle adjustments, credit notes, pause periods, and subscriptions

It's **not** a customer-facing app. It's a single-operator admin tool accessed
from the operator's phone, installable as a PWA, designed to work offline.

## Tech stack (all bleeding-edge as of build)

| Layer       | Choice                                    | Notes                                         |
| ----------- | ----------------------------------------- | --------------------------------------------- |
| UI          | React 19.2 + Vite 8.1                     | JSX, no TypeScript                            |
| Icons       | lucide-react 1.24                         |                                               |
| Backend     | **Supabase directly** (no Node server)    | `@supabase/supabase-js` v2.110                |
| Service Wk  | Vanilla `public/sw.js` (V21)              | Cache-first shell, network-only for /api      |
| State       | React hooks (no Redux/Zustand)            | Composable custom hooks                       |
| Routing     | Tab-based (no react-router)               | State field `tab` in `useAppState`            |
| Tests       | Vitest 4 + jsdom + Testing Library        | Coverage is intentionally enforced separately |
| Lint        | ESLint 10 + react-hooks + react-refresh   | `no-console` warn (warn/error allowed)        |
| Other tools | cspell, fallow, madge, prettier, depcheck | Advisory tools are not all in `check-all`     |

## Repository layout

```
src/
├── main.jsx               # Mounts <App/> into #app-root
├── App.jsx                # Auth gate → ErrorBoundary → Shell + Page + Modals
├── index.css
├── lib/
│   ├── supabaseClient.js  # Single `supabase` instance from env
│   ├── api.js             # 🔑 callApi(action, payload) — all data ops live here
│   ├── constants.js       # SC (status colors), DAYS, MILK_TYPES, PRODUCTS, PAY_MODES
│   ├── filters.js         # Pure filter helpers (filterCustomers/Imports/Bills)
│   ├── utils.js           # fmt(), getToday() [Asia/Kolkata], cleanPhone(), UUID helpers
│   ├── database.types.ts  # Generated current Supabase types; never edit manually
│   └── validation/        # validateCustomerForm, validateImportForm
├── hooks/
│   ├── useAuth.js                  # Supabase Auth session + 6-digit operator PIN login
│   ├── useAppState.js              # Composes: useEntityStore + useFilterState + useAppUi + useAppDerived
│   ├── useAppDerived.js            # Memoized: activeC, totalRevenue, pendingDues, filteredC, todayLogs…
│   ├── useAppHandlers.js           # Composes 6 domain handler hooks (see below)
│   ├── useBusy.js                  # Re-entrancy guard for async button handlers
│   ├── useEntityStore.js           # 9 entity arrays + safeFetch + refresh
│   └── handlers/
│       ├── shared.js               # useHelpers() — showToast, executeApiAction, saveWithValidation
│       ├── useCustomerHandlers.js
│       ├── useBillingHandlers.js   # useBillPayments + useBillOperations
│       ├── useBillPayments.js
│       ├── useBillOperations.js
│       ├── useImportHandlers.js
│       ├── useDeliveryHandlers.js
│       ├── useAdminHandlers.js     # Brands + Pauses
│       └── useSubscriptionHandlers.js
├── pages/
│   ├── Dashboard.jsx
│   ├── Customers.jsx
│   ├── Delivery.jsx        # 📍 Daily-driver page: toggle delivered/skipped, generate, ad-hoc
│   ├── Imports.jsx
│   ├── Billing.jsx
│   └── More.jsx            # Adjustments, Pauses, Brands, diagnostics, health, PIN rotate
├── components/
│   ├── AppShell.jsx        # Top header + bottom nav + load-error banner + dark mode
│   ├── AppPage.jsx         # PAGE_RENDERERS table: tab → page component
│   ├── AppModals.jsx       # MODAL_RENDERERS table: modal type → component
│   ├── ErrorBoundary.jsx   # Class component — Reload / Sign-out & reload
│   ├── login.jsx           # 6-digit operator PIN form
│   ├── ui.jsx              # Badge, Toast, Modal, Btn, Field, Card, Empty, Section, StatGrid
│   ├── forms.jsx           # All 13 modal components (Customer, Import, Payment, …)
│   └── modals/             # One file per modal (same as forms.jsx exports)
└── test/setup.js

public/
├── sw.js                   # Service worker (offline-first PWA)
├── register-sw.js
├── app.css
├── favicon.svg, icons.svg, icon-512.png, apple-touch-icon.png

supabase/
├── schema.sql              # Generated present-state schema; never edit manually
└── migrations/             # Historical ledger; ignore except a newly created migration
```

## Architecture rules — please follow

### 1. All data ops go through `callApi(action, payload)` in `src/lib/api.js`

There is **no** REST backend. The `callApi` function is a giant `switch` that
dispatches to a Supabase query. New endpoints = new `case` in the switch.
**Never** call `supabase.from(...)` or `supabase.rpc(...)` directly from a component,
page, or handler. Supabase Auth calls in `useAuth.js` are the narrow exception.

Action names are CamelCase strings: `getCustomers`, `addCustomer`, `recordPayment`,
`generateDailyLogsForDate`, etc. Read the existing switch before adding. Unknown
actions must throw; do not silently report success.

### 2. State composition pattern (don't break it)

```
useAppState(auth)
  ├─ useAppUi()              // must initialize before consumers of logDate/billMonth
  ├─ useFilterState()        // search/filter inputs
  ├─ useEntityStore(token, logDate, billMonth)
  └─ useAppDerived(state)    // memoized: activeC, totalRevenue, pendingDues, filteredC…

useAppHandlers(state)
  └─ spreads 6 domain hooks (customer/billing/import/delivery/admin/subscription)
```

If you add new state, add it to the right hook in the chain, not at the top.
Never reference a local hook result before its declaration; bundling may succeed while
the app still crashes at runtime from the temporal dead zone. Derived state should be
computed once in `useAppState`, not recomputed by page components.

### 3. Handlers reuse `useHelpers()`

All handler hooks share `useHelpers(state)` from `handlers/shared.js` for:

- `showToast(msg, type)`
- `executeApiAction(action, payload, successMsg, getList, setList, mapFromApi, resKey)`
- `handleFormAction(action, formArg, successMsg, mapToApi, getList, setList, mapFromApi, resKey)`
- `handleIdAction(action, idKey, id, successMsg, getList, setList, mapFromApi, resKey)`
- `saveWithValidation(formArg, validateFn, handlers, entityName)`

`saveWithValidation` expects the handler object to have
`add<Entity>` and `update<Entity>` methods keyed on `entityName` passed in.

Arguments are positional: `getList` is an action string such as `"getCustomers"`,
not an array or getter result; `resKey` is the response key such as `"customers"`.
Check every UI callback contract too: if a page passes an ID, the handler must accept
an ID; if it needs the full entity/version, pass the full entity explicitly.

Each user action must call its mutation exactly once and show at most one success
toast. Copy/paste leftovers that invoke the same action twice are release blockers.

### 4. API ↔ UI shape mapping

DB uses `snake_case` (e.g. `delivery_address`, `daily_qty`, `amount_paid`,
`delivery_days` as JSONB). UI uses `camelCase` (e.g. `address`, `qty`, `paid`,
`deliveryDays` as JS array). All conversion happens in `lib/api.js`
via `mapXFromApi` (DB→UI) and `mapXToApi` (UI→DB). **Do not** sprinkle
snake_case reads in pages or camelCase writes in the switch.

Map every row **exactly once**. Before mapping a response in a store or handler,
inspect the corresponding `callApi` case to determine whether it already returns UI
shape. Double-mapping silently turns fields such as `custId`/`paid` into
`undefined`/`0`. Add a regression test for the returned shape when changing a mapper.

### 5. Optimistic concurrency control

`customers`, `milk_imports`, `bills`, and `subscriptions` currently carry a
`version INT` column. Confirm this in `database.types.ts` before relying on it;
do not invent a version field for another table. The
`updateWithVersion(table, id, expectedVersion, patch)` helper performs a
compare-and-set update. Always pass the version through update, lock, unlock,
confirm, deactivate, and delete paths for versioned entities.

A versioned update/delete must verify that exactly one row was affected. A Supabase
mutation can return no error while matching zero rows, so a successful HTTP response
alone is not proof that the mutation happened.

### 6. JSONB array columns

`customers.delivery_days` and `subscriptions.delivery_days` are `JSONB` arrays
of integers `[0..6]` where `0 = Sun, 6 = Sat` (matches `DAYS` in constants.js).
The `toArray()` helper in `lib/api.js` accepts either an array, a JSON string,
or a comma-separated string. Always JSON.stringify() on write.

### 7. Status strings (PascalCase — match DB)

Per `SC` in `constants.js`: `Active`, `Paused`, `Inactive`, `Draft`, `Confirmed`,
`Paid`, `Unpaid`, `Partial`, `Pending`, `Failed`, `Dead`, `Reconciled`, `Applied`,
`Delivered`, `Skipped`. **Don't** use `"paid"` / `"PAID"` — backend will
compare literally and silently fail filtering.

### 8. Currency and dates

- `fmt(n)` from `lib/utils.js` → `₹1,234.56` (en-IN locale, 2 decimals, safe on null)
- `getToday()` → `YYYY-MM-DD` in `Asia/Kolkata`. Use this, not `new Date().toISOString().slice(0,10)`.
- `cleanPhone(p)` strips non-digits; WhatsApp share prepends `91` if 10 digits.
- All month strings are `YYYY-MM` (e.g. `"2026-07"`). `nextMonthStart(month)` in `api.js`.

### 9. Auth model

- Authentication uses **Supabase Auth**, not the `settings` table and not a custom
  PIN-hash/token RPC.
- The six-digit operator PIN is the Supabase Auth password for the confirmed account
  `operator@milk.local`. Supabase owns password hashing, salting, refresh tokens, and
  session persistence.
- `useAuth.js` calls `signInWithPassword`, tracks the Supabase session, and exposes
  `session?.access_token` only as a data-loading gate.
- PIN rotation must reauthenticate the current PIN and call
  `supabase.auth.updateUser`; never store or compare PINs in public tables.
- Handle both `getSession()` rejection and `auth:expired` events. An auth failure must
  terminate loading and sign out rather than leave a permanent spinner.
- The anon key is public by design. Security comes from authenticated RLS and
  correctly authorized RPCs, never from hiding frontend environment variables.
- A six-digit PIN is a weak password. Do not weaken Supabase rate limiting or add
  alternative bypass paths. Never log PINs, passwords, sessions, or access tokens.

### 10. Error layers (in order they trigger)

1. `safeFetch` in `useEntityStore` — non-fatal, appends to `loadErrors[]`,
   shows top banner with Retry button.
2. `useBusy` swallows re-entrant calls (no toast, just ignored).
3. `try/catch` inside each handler — `showToast(e.message, "error")`.
4. `ErrorBoundary` (class) — catches uncaught render errors anywhere below
   `<App/>`, shows full-screen Reload / Sign-out & reload card.

### 11. Modal and page routing

- `PAGE_RENDERERS` map in `AppPage.jsx`: `{ dashboard, customers, delivery, imports, billing, more }`.
- `MODAL_RENDERERS` map in `AppModals.jsx`: `{ addCustomer, editCustomer, addImport, payment, changePin, billDetail, addAdj, addPause, addBrand, addAdHoc, addCreditNote, subscriptionHistory, subscriptionsList, addSubscription, editSubscription }`.
- To add a page: add to the tab list in `AppShell.jsx` (`TABS` array) AND
  add a `renderX(state, handlers)` + an entry in `PAGE_RENDERERS`.
- To add a modal: create the component, import in `AppModals.jsx`, add a
  `renderXModal(ctx)` and an entry in `MODAL_RENDERERS`.

### 12. Lint and conventions

- `no-console` is `warn` — only `console.warn` / `console.error` are allowed
  (the codebase uses `console.warn` heavily in `useHelpers` for debug breadcrumb
  trails; feel free to keep that style or remove it).
- Unused vars must be prefixed with `_` to be ignored.
- Don't introduce new files into `lib/validation/` without also re-exporting
  from `lib/validation.js`.
- Inline styles are heavily used in the existing UI (especially in `AppShell`,
  `Dashboard`, `Delivery`); prefer matching that style for consistency over
  introducing CSS-modules.
- `form.css` classes referenced in components live in `src/index.css` — keep
  class names aligned when adding new ones (`.field`, `.input`, `.btn-*`,
  `.card`, `.modal-overlay`, `.toast`, `.bottom-nav`, etc.).

### 13. RLS is the security boundary

The browser has the public anon key, so authorization must be correct in PostgreSQL.
Treat every authenticated user other than the intended operator as potentially hostile.

- PostgreSQL permissive RLS policies are combined with **OR**, not AND. Adding an
  operator-only policy does not restrict an existing `USING (true)` authenticated
  policy. Restrictive work must drop/replace broad policies in the same migration.
- Review all policies for a table together and separately for `SELECT`, `INSERT`,
  `UPDATE`, and `DELETE`. Check both `USING` and `WITH CHECK`.
- Do not hardcode a production Auth UUID without documenting deployment coupling and
  a safe account-replacement procedure. Prefer a verifiable role/claim model when
  more than one environment or operator is possible.
- Never grant financial or mutating RPCs to `anon`. Revoke default/public execute
  privileges when appropriate and grant only the intended role.
- A `SECURITY DEFINER` function must set a safe `search_path`, explicitly authorize
  the caller, validate every identifier, and expose only the minimum required grants.
  Do not use it merely to bypass broken RLS.
- RLS and function grants are separate controls; review both. Test an authenticated
  non-operator and an anonymous caller, not only the happy-path operator.

### 14. Financial mutations must be atomic

Payments, bill generation, adjustments, and credit-note application are ledger-grade
operations. A client-side `select → calculate → update → insert` sequence is not
atomic and can leave partial financial state.

- Put multi-table money mutations in one PostgreSQL function/transaction and call it
  through one `callApi` action.
- Lock the affected rows (`FOR UPDATE`), validate ownership/customer relationships,
  locked status, amount bounds, and current state inside the transaction.
- Use a real UUID idempotency key for retryable writes and enforce uniqueness in the
  database. Reusing the same key must return the original success without applying
  money twice.
- Update the bill and its ledger row together. Never update `amount_paid` without a
  corresponding payment/credit record.
- Define adjustment sign semantics once. Do not have one path add an amount while
  another subtracts it.
- Enforce invariants in SQL as well as UI validation: non-negative totals, paid not
  above amount unless explicitly supported, valid status transitions, and matching
  customers.
- Financial tests must cover success, duplicate retry, overpayment, locked bill,
  wrong customer, concurrent/stale update, and rollback after a forced failure.

### 15. RPC and schema contracts

- Before creating or calling an RPC, compare every argument and referenced column to
  `database.types.ts` and `schema.sql`.
- PostgreSQL functions are overloaded by argument signature. `CREATE OR REPLACE` with
  new arguments creates another function; it does not replace the old signature.
  Drop obsolete overloads in a new migration and confirm generated types show only
  the intended signature.
- Do not leave legacy write RPCs callable as alternate paths around current validation,
  idempotency, ledger, OCC, or authorization rules.
- RPC parameter names and JavaScript payload keys must match exactly. Date values use
  `YYYY-MM-DD`; UUID parameters receive actual UUIDs.
- Check the generated schema after `db:sync` for duplicate functions, stale grants,
  invalid triggers, and policies that preserve older access.

### 16. UI callback and form contracts

- Pick one field-change contract per form: curried `onChange(key)(event)` or direct
  `onChange(key, value)`. Do not pass one implementation to components expecting the
  other contract.
- Form field names must match mapper inputs (`qty` is not `quantity`). Defaults must
  use canonical constants such as `"Full Cream"`, not ad-hoc enum spellings.
- Editing must pass the full entity, including its ID and version, into modal/form
  state. Opening a modal without data must not erase the edit target.
- Context properties must exist. Do not pass `ctx.showToast`, `ctx.setForm`, or any
  other callback unless it is actually exposed by state/handlers.
- Add interaction tests for destructive buttons, modal save paths, and callback
  argument shape. Static diagnostics cannot detect ID-vs-object mismatches.

### 17. Validation is evidence, not proof

- `npm run build` proves bundling, not runtime behavior. It will not catch many hook
  ordering errors, broken callbacks, bad Supabase contracts, or RLS mistakes.
- Mount `<App />` or the affected state hook in tests after changing composition,
  authentication, or modal context.
- Mocked API tests prove only the mocked contract. Database RPC/RLS changes require
  integration checks against a disposable/local Supabase environment when available.
- Never label a release production-ready solely because `check-all` passes. Report
  exactly which commands ran, what they include, and any checks omitted or failing.

## Common workflows

### Add a new entity

1. Create a new migration with `supabase migration new <descriptive_name>` and add
   the table, constraints, indexes, RLS policies, grants, and any required RPCs.
2. Push it with `supabase db push`, then run `npm run db:sync` to regenerate
   `schema.sql` and `database.types.ts`.
3. Verify the generated types and schema before writing frontend queries.
4. Add `mapXFromApi` and, if writable, `mapXToApi` in `lib/api.js`.
5. Add state + setter to `useEntityStore` (initial `[]`, add to `safeFetch`
   parallel calls).
6. Add a `case` in the `callApi` switch (at minimum `getX`).
7. Add a handler hook in `hooks/handlers/useXHandlers.js` and spread it in
   `useAppHandlers.js`.
8. Add/register the page or modal and test the complete UI → handler → API contract.

### Debug a failing action

- Check the `console.warn` breadcrumb trail — `useHelpers` logs every step.
- Check `loadErrors` banner at top of `AppShell`.
- Check Supabase Auth for the confirmed `operator@milk.local` account if login is
  broken; never inspect or store a PIN in `settings`.
- Service worker cache: bump `CACHE` constant in `public/sw.js` to force
  eviction on next load (currently `"milk-v21"`).

### Run all checks

```bash
npm run check-all      # currently lint + unit tests + build only
npm run test:coverage  # enforced thresholds; run and report separately
npm run advisor-all    # coverage + fallow + spellcheck + depcheck
```

Other available checks include `audit`, `circular`, `cprettier`, `spellcheck`,
`check-deps`, and `fallow`. Inspect `package.json` before describing what an aggregate
script runs. A check that is not in the script did not run. Do not weaken thresholds
or remove checks merely to make a gate green.

## Environment

`.env` (committed in this repo, treat as dev/test):

- `VITE_SUPABASE_URL` = `https://qipvmrgieuvpygjytcpt.supabase.co`
- `VITE_SUPABASE_ANON_KEY` = public anon JWT; authenticated RLS and RPC authorization
  must protect business data.

Both are read once in `src/lib/supabaseClient.js`. No env-var type-checking;
missing env = null client = silent failures. Don't add new env vars without
a guard in `supabaseClient.js`.

## Things to be careful about

- **Coverage is thin, especially in `lib/api.js` and application startup paths.**
  Add tests when changing `lib/`, handlers, auth, state composition, or modal wiring.
  Do not assume the current suite exercises a newly changed path.
- **`useBusy` filters React SyntheticEvents from args** — if you write a
  custom async wrapper, follow that pattern or re-entry will pass DOM
  events to your API mapper.
- **The `version` check is the frontend OCC guard for versioned entities** — if you
  skip it on an update path, concurrent tabs can silently overwrite each other.
  Financial RPCs additionally require transactional row locks.
- **Toast timer is tracked by id** — see `useAppState.js` `toast$`; don't
  replace it with a naive `setTimeout` or you'll leak timers and get stale
  toasts.
- **`generateDailyLogsForDate` runs four parallel queries** to customers,
  subscriptions, pauses, and existing logs, then batches inserts. Don't
  refactor to a sequential loop or you'll kill the "Generate" button perf.
- **Service worker: never cache `/api` or `/functions`** — security fix
  baked into the V21 `sw.js`.

## 🗄️ Database Migrations & Schema Context

### AI Agent Context Rules (STRICT ENFORCEMENT)

**DO NOT** read historical migrations to infer the current database. They contain
superseded columns, policies, grants, and function definitions.

Use only these present-state artifacts for database discovery:

1. **`supabase/schema.sql`** — compiled tables, constraints, policies, grants,
   functions, and triggers.
2. **`src/lib/database.types.ts`** — generated columns, relationships, and RPC
   signatures. Use this as the primary contract when writing frontend code.

AI agents must otherwise ignore:

- `supabase/migrations/` — historical ledger
- `supabase/_archive/` — legacy scripts
- `supabase_sql_editor/` — legacy manual SQL

The only migration-directory exception is a migration created during the current task:
an agent may create and edit that new file, but must not inspect older migrations for
context. Review the generated present-state artifacts after applying it.

### Migration Workflow Rules (For Humans & AI)

1. **Never use the Supabase Table Editor UI.** Write every schema change as SQL.
2. Create a new migration with `supabase migration new <descriptive_name>`; never
   modify a committed or deployed migration.
3. Verify table columns, RPC signatures, policy names, and grants against the current
   generated artifacts before writing the migration.
4. Apply pending migrations with `supabase db push`. Do not paste SQL into the
   dashboard unless the user explicitly requests an emergency hotfix.
5. If a migration is wrong after application, create a new corrective migration;
   never delete or rewrite migration history.
6. Run `npm run db:sync` after pushing. Do not manually edit `schema.sql` or
   `database.types.ts`.
7. Review the regenerated artifacts for stale overloads, permissive policies, grants
   to `anon`, invalid triggers, missing constraints, and type drift.
8. Commit the new migration and both regenerated artifacts together.
