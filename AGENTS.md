# AGENTS.md — c1milk / S_milk

> Single source of truth for AI agents working in this repo. Read this first.

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

| Layer       | Choice                                    | Notes                                        |
| ----------- | ----------------------------------------- | -------------------------------------------- |
| UI          | React 19.2 + Vite 8.1                     | JSX, no TypeScript                           |
| Icons       | lucide-react 1.24                         |                                              |
| Backend     | **Supabase directly** (no Node server)    | `@supabase/supabase-js` v2.110               |
| Service Wk  | Vanilla `public/sw.js` (V21)              | Cache-first shell, network-only for /api     |
| State       | React hooks (no Redux/Zustand)            | Composable custom hooks                      |
| Routing     | Tab-based (no react-router)               | State field `tab` in `useAppState`           |
| Tests       | Vitest 4 + jsdom + Testing Library        | Very thin coverage — only filters + delivery |
| Lint        | ESLint 10 + react-hooks + react-refresh   | `no-console` warn (warn/error allowed)       |
| Other tools | cspell, fallow, madge, prettier, depcheck | `npm run check-all` runs the lot             |

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
│   ├── utils.js           # fmt(), getToday() [Asia/Kolkata], cleanPhone(), uuid()
│   └── validation/        # validateCustomerForm, validateImportForm
├── hooks/
│   ├── useAuth.js                  # PIN login, sessionStorage token, auth:expired event
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
│   ├── login.jsx           # 4-digit PIN form
│   ├── ui.jsx              # Badge, Toast, Modal, Btn, Field, Card, Empty, Section, StatGrid
│   ├── forms.jsx           # All 13 modal components (Customer, Import, Payment, …)
│   └── modals/             # One file per modal (same as forms.jsx exports)
└── test/setup.js

public/
├── sw.js                   # V21 service worker (offline-first PWA)
├── register-sw.js
├── app.css
├── favicon.svg, icons.svg, icon-512.png, apple-touch-icon.png

supabase_sql_editor         # Full DB schema (paste into Supabase SQL editor)
```

## Architecture rules — please follow

### 1. All data ops go through `callApi(action, payload)` in `src/lib/api.js`

There is **no** REST backend. The `callApi` function is a giant `switch` that
dispatches to a Supabase query. New endpoints = new `case` in the switch.
**Never** call `supabase.from(...)` directly from a component or page.

Action names are CamelCase strings: `getCustomers`, `addCustomer`, `recordPayment`,
`generateDailyLogsForDate`, etc. Read the existing switch before adding.

### 2. State composition pattern (don't break it)

```
useAppState(auth)
  ├─ useEntityStore(token)   // raw arrays: customers, bills, logs, …
  ├─ useFilterState()        // search/filter inputs
  ├─ useAppUi()              // tab, toast, modal, form, billMonth, logDate
  └─ useAppDerived(state)    // memoized: activeC, totalRevenue, pendingDues, filteredC…

useAppHandlers(state)
  └─ spreads 6 domain hooks (customer/billing/import/delivery/admin/subscription)
```

If you add new state, add it to the right hook in the chain, not at the top.

### 3. Handlers reuse `useHelpers()`

All handler hooks share `useHelpers(state)` from `handlers/shared.js` for:

- `showToast(msg, type)`
- `executeApiAction(action, payload, successMsg, getList, setList, mapFromApi, resKey)`
- `handleFormAction(action, formArg, successMsg, mapToApi, getList, setList, mapFromApi, resKey)`
- `handleIdAction(action, idKey, id, successMsg, getList, setList, mapFromApi, resKey)`
- `saveWithValidation(formArg, validateFn, handlers, entityName)`

`saveWithValidation` expects the handler object to have
`add<Entity>` and `update<Entity>` methods keyed on `entityName` passed in.
Look at `useCustomerHandlers` for the canonical pattern.

### 4. API ↔ UI shape mapping

DB uses `snake_case` (e.g. `delivery_address`, `daily_qty`, `amount_paid`,
`delivery_days` as JSONB). UI uses `camelCase` (e.g. `address`, `qty`, `paid`,
`deliveryDays` as JS array). All conversion happens in `lib/api.js`
via `mapXFromApi` (DB→UI) and `mapXToApi` (UI→DB). **Do not** sprinkle
snake_case reads in pages or camelCase writes in the switch.

### 5. Optimistic concurrency control

`customers`, `milk_imports`, `bills`, `subscriptions` all carry a `version INT`
column. The `updateWithVersion(table, id, expectedVersion, patch)` helper in
`lib/api.js` does a compare-and-set update: `eq("version", ev)` — if the
row was changed elsewhere, Supabase returns `PGRST116` and we throw a
`CONFLICT` error that the UI surfaces as a toast. Always pass the version
through when editing these entities.

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

- 4-digit PIN stored in `settings.key = 'PIN'` (default seed: `"1234"`).
- `verifyPIN(pin)` generates a random UUID, stores in sessionStorage
  (`token` + `sessionSecret`). **No JWT, no server validation** — the token
  is purely a UI gate. RLS is fully open (every policy is `USING (true) WITH CHECK (true)`).
- `callApi` catches Supabase auth codes (`42501`, `PGRST301`, `PGRST302`,
  or `jwt`-matching message) and dispatches `window.dispatchEvent(new
CustomEvent("auth:expired"))` → `useAuth` clears both storages and logs out.
- **Token storage: sessionStorage, not localStorage** (intentional XSS window
  reduction — see comment in `useAuth.js`). New tabs require re-login.

### 10. Error layers (in order they trigger)

1. `safeFetch` in `useEntityStore` — non-fatal, appends to `loadErrors[]`,
   shows top banner with Retry button.
2. `useBusy` swallows re-entrant calls (no toast, just ignored).
3. `try/catch` inside each handler — `showToast(e.message, "error")`.
4. `ErrorBoundary` (class) — catches uncaught render errors anywhere below
   `<App/>`, shows full-screen Reload / Sign-out & reload card.

### 11. Modal and page routing

- `PAGE_RENDERERS` map in `AppPage.jsx`: `{ dashboard, customers, delivery, imports, billing, more }`.
- `MODAL_RENDERERS` map in `AppModals.jsx`: `{ addCustomer, editCustomer, addImport, payment, billDetail, addAdj, addPause, addBrand, addAdHoc, addCreditNote, subscriptionHistory, subscriptionsList, addSubscription, editSubscription }`.
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

## Common workflows

### Add a new entity

1. Add SQL to `supabase_sql_editor` (table + RLS policy).
2. Add a `mapXFromApi` and (if writable) `mapXToApi` in `lib/api.js`.
3. Add state + setter to `useEntityStore` (initial `[]`, add to `safeFetch`
   parallel calls).
4. Add a `case` in the `callApi` switch (at minimum `getX`).
5. Add a handler hook in `hooks/handlers/useXHandlers.js`.
6. Spread it in `useAppHandlers.js`.
7. Add a page or add a tab + a `renderX(state, handlers)` in `AppPage.jsx`.
8. Add a modal in `components/forms.jsx` and register it in `AppModals.jsx`.

### Debug a failing action

- Check the `console.warn` breadcrumb trail — `useHelpers` logs every step.
- Check `loadErrors` banner at top of `AppShell`.
- Check `settings` table for the PIN if login is broken.
- Service worker cache: bump `CACHE` constant in `public/sw.js` to force
  eviction on next load (currently `"milk-v21"`).

### Run all checks

```bash
npm run check-all   # lint + test + build + audit + circular + fallow + health + spellcheck + depcheck
```

Or pick any of: `lint`, `lint:fix`, `test`, `test:coverage`, `build`, `audit`,
`circular` (madge), `prettier:check` / `prettier:write` (alias `cprettier`/`wprettier` — add to cspell), `spellcheck`, `check-deps` (depcheck),
`fallow`, `health`, `dev`.

## Environment

`.env` (committed in this repo, treat as dev/test):

- `VITE_SUPABASE_URL` = `https://qipvmrgieuvpygjytcpt.supabase.co`
- `VITE_SUPABASE_ANON_KEY` = anon JWT, RLS is open so this works for any caller.

Both are read once in `src/lib/supabaseClient.js`. No env-var type-checking;
missing env = null client = silent failures. Don't add new env vars without
a guard in `supabaseClient.js`.

## Things to be careful about

- **No tests for the bulk of the code.** Only `lib/filters.test.js`,
  `lib/validation.test.js`, `pages/Delivery.test.jsx`, and
  `hooks/useAppHandlers.test.js` exist. Add tests when changing anything
  in `lib/` or any handler.
- **`useBusy` filters React SyntheticEvents from args** — if you write a
  custom async wrapper, follow that pattern or re-entry will pass DOM
  events to your API mapper.
- **The `version` check is the only concurrency guard** — if you skip it on
  an update path, two operators overwriting each other will silently lose data.
- **Toast timer is tracked by id** — see `useAppState.js` `toast$`; don't
  replace it with a naive `setTimeout` or you'll leak timers and get stale
  toasts.
- **`generateDailyLogsForDate` runs four parallel queries** to customers,
  subscriptions, pauses, and existing logs, then batches inserts. Don't
  refactor to a sequential loop or you'll kill the "Generate" button perf.
- **Service worker: never cache `/api` or `/functions`** — security fix
  baked into the V21 `sw.js`.
