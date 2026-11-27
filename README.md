# 🥛 Milk Delivery Admin (S_milk / c1milk)

[![React](https://img.shields.io/badge/React-19.2-61DAFB?logo=react)](https://react.dev/)
[![Vite](https://img.shields.io/badge/Vite-8.1-646CFF?logo=vite)](https://vitejs.dev/)
[![Supabase](https://img.shields.io/badge/Supabase-PostgreSQL-3ECF8E?logo=supabase)](https://supabase.com/)
[![PWA](https://img.shields.io/badge/PWA-Installable-5A0FC8?logo=pwa)](#offline--pwa)

An internal **Progressive Web App (PWA)** for a small milk-delivery business in
India. One operator — from a phone — manages customers, per-brand delivery
subscriptions, daily delivery logs, milk purchases from suppliers, and monthly
billing with WhatsApp share. It is **not** customer-facing, installable as a
PWA, and designed to survive flaky connectivity.

This document is a **complete, standalone description of the project as it
exists today**: every feature, every flow, every layer, and how they connect.
It doubles as a spec/prompt — reading it end-to-end should tell you everything
the codebase does without opening the source. The agent-facing rule set with
the same depth lives in [`AGENTS.md`](./AGENTS.md).

---

## Table of contents

1. [How the app works — the big picture](#how-the-app-works--the-big-picture)
2. [App tour — pages and modals](#app-tour--pages-and-modals)
3. [Core flows in detail](#core-flows-in-detail)
4. [Data model](#data-model)
5. [Error handling layers](#error-handling-layers)
6. [Offline & PWA](#offline--pwa)
7. [Repository layout](#repository-layout)
8. [Getting started](#getting-started)
9. [npm scripts reference](#npm-scripts-reference)
10. [Testing](#testing)
11. [Conventions & shared helpers](#conventions--shared-helpers)
12. [Security model](#security-model)
13. [Deployment](#deployment)
14. [Known limitations & future work](#known-limitations--future-work)
15. [Keeping these docs accurate](#keeping-these-docs-accurate)

---

## How the app works — the big picture

There is **no REST backend and no Node server**. The React app talks to
Supabase (PostgreSQL + Auth + PostgREST) directly, through one funnel:

```
UI (pages + modals)
  → handlers (hooks/handlers/*, one per domain)
    → callApi(action, payload)          ← the ONLY data door (src/lib/api.js)
      → DISPATCH table → lib/api/<domain>.js
        → mappers (DB snake_case ↔ UI camelCase)
          → supabase-js → PostgREST / Auth
            → RLS + SECURITY DEFINER RPCs (the real security boundary)
              → PostgreSQL (13 tables, 9 RPCs)
```

State flows the other way through a fixed hook composition:

```
useAppState(auth)
  ├─ useDayTick()      — bumps every 60s / on focus/visibility → midnight rollover
  ├─ useAppUi()        — tab, toast, modal, form, logDate, billMonth
  ├─ useFilterState()  — search/filter inputs per page
  ├─ useEntityStore()  — 9 entity arrays; two fetch groups (see below)
  └─ useAppDerived()   — memoized: activeC, totalRevenue, pendingDues, filtered lists

useAppHandlers(state) → spreads 6 domain handler hooks into one flat object
```

One user action = **one handler call = one `callApi` = one toast**. Money
mutations never touch tables directly from the client; they call a
single-transaction PostgreSQL function (`*_rpc`) that locks rows, validates
business rules, and either fully applies or fully rolls back.

### The data-loading contract

`useEntityStore` splits fetching into two parallel groups:

- **Date-independent** (fetched once on login + manual refresh):
  `getCustomers`, `getMilkImports`, `getAdjustments`, `getPauses`, `getBrands`,
  `getSubscriptions`, `getCreditNotes` — 7 requests in one `Promise.all`.
- **Date-dependent** (refetched on every date/month change only):
  `getBills { month: billMonth }` and `getDailyLogs { date: logDate }`.

Every fetch goes through `safeFetch`, which turns failures into entries in
`loadErrors[]` — a red banner with a **Retry** button at the top of the shell —
instead of crashing the app. Mutations, by contrast, throw and surface as
error toasts inside the handler that called them.

While the first fetches are in flight, `useEntityStore` exposes hydration
flags (`coreLoading` / `dateLoading` / `loading`) so pages show **skeleton
lists** instead of a false "no data" empty state. The flags are only raised
on mount — manual refreshes and date changes keep existing rows on screen.

### UI design system — "Ledger" (2026-11 rebuild)

The visual layer is a token-driven design system in `src/index.css`. It is
deliberately a **working tool, not a pitch deck**: warm paper, ink, one
accent, and structure carried by rules rather than decoration.

- **Themes** — a warm-paper light theme (`#f4f4f0` ground, white surfaces)
  and an ink dark theme, both defined as CSS variables on `:root` / `.dark`.
  A stored `darkMode` preference always wins; with no stored value the OS
  `prefers-color-scheme` decides. `public/apply-dark-mode.js` applies the
  theme before first paint (no flash), and `AppShell` keeps the
  `<meta name="theme-color">` in sync.
- **Type** — IBM Plex Sans for UI text; IBM Plex Mono for labels, dates,
  literals, and money (tabular figures). There is no display/numeral face:
  hierarchy comes from weight, size, and spacing. `--font-display` is kept
  as an alias of the UI face for older components.
- **Chrome** — 1px hairline borders, 4–8px radii, and exactly one pine-green
  accent (`--brand-500/600/700`). No gradients, glass, glow, or ambient
  decoration. Lists are continuous divided panels, stat tiles form one ruled
  KPI strip, and filter chips are segmented controls.
- **Navigation** — one `.bottom-nav` element switched purely in CSS: a bottom
  bar on phones with a 2px active underline, a left rail on desktop with a
  2px pine rule on the active item (no filled active card).
- **Login** — an asymmetric two-column desktop page (wordmark, `h1`, lede,
  operator metadata beside a bordered sign-in panel) that collapses to a
  single stacked column on phones.
- **Pages render state, not derivation** — search/sort/filter inputs live in
  `useFilterState`, flow through the pure filters in `lib/filters.js`
  (`filterBills` supports text search + newest/due/name sort), and are
  computed once in `useAppDerived`. Shared aggregations (brand × milk-type
  stock/quantity math for Delivery and Imports) live in `lib/breakdowns.js`.
- **Primitives** (`components/ui.jsx`) — `Modal` with focus trap, scroll
  lock, Escape/backdrop close and a `footer` action slot; `Field` with
  automatic label association and error ARIA; `StatGrid` (with per-tile
  accent), `ChipRow`, `SearchInput`, `Toolbar`, `Skeleton`, `ProgressRing`,
  `MiniBars`, `IconButton`, `Empty` (icon/title/hint). Icons are lucide only
  — no emoji in product chrome.
- **Modals** — bottom sheets on phones, centered cards on desktop; all 12
  modal components share the same footer/field styling while preserving
  every label, placeholder, and test/e2e contract.
- **Accessibility bar** — Lighthouse 1.0/1.0/1.0 on the login screen
  (`<main>` landmark, 4.5:1-calibrated text tokens, `public/robots.txt`
  opting the internal tool out of indexing), `prefers-reduced-motion`
  support, and visible focus rings throughout.

---

## App tour — pages and modals

Tab-based routing (no react-router): `AppShell` renders 7 bottom-nav tabs,
`AppPage.jsx` maps tab → page via `PAGE_RENDERERS`, and `AppModals.jsx` maps a
`modal.type` string → component via `MODAL_RENDERERS` (15 modal types, 12
modal components in `src/components/modals/`, re-exported by `forms.jsx`
except `ChangePinModal` which is imported directly).

| Tab           | Page                | What it does                                                                                                                                                                              | Opens                                                                                  |
| :------------ | :------------------ | :---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | :------------------------------------------------------------------------------------- |
| **Home**      | `Dashboard.jsx`     | KPI tiles (active customers, collected revenue, pending dues, delivered stock today — with a completion ring), today's log list, clickable recent bills, quick actions                     | `addCustomer`, `addImport`, **Generate Bills**, `addAdj`, `addPause`, `addBrand`       |
| **Customers** | `Customers.jsx`     | Identity-only customer cards (name, address, phone, status, balance) with search + status chips with counts, WhatsApp share, deactivate (OCC-guarded), each card lists that customer's subscriptions | `editCustomer`, `addSubscription` (prefilled with the customer id)            |
| **Subs**      | `Subscriptions.jsx` | Full subscription management: search/filter chips, add / edit / delete (version-checked) / history                                                                                        | `addSubscription` (with `NEW_SUB_DEFAULTS`), `editSubscription`, `subscriptionHistory` |
| **Delivery**  | `Delivery.jsx`      | The daily driver page: date stepper (prev/next/Today), clickable stat tiles that switch the list view (scheduled / delivered / skipped / brand × type stock table), per-log done/skip toggle with search, add extra delivery | `addAdHoc`                                                    |
| **Imports**   | `Imports.jsx`       | Milk purchases from suppliers: draft → **Confirm** / delete (both via OCC RPCs), month/day/range views + brand/status filters, day-stock card, qty & cost breakdown, brand manager (add + edit per-milk-type rates) | `addImport` (add _and_ edit — the modal handles both), `addBrand`, `editBrand` |
| **Billing**   | `Billing.jsx`       | Monthly bills per customer: month picker, text search + status chips with counts + sort (newest/due/name), KPIs, lock/unlock, record payment, bill detail, WhatsApp share, issue credit note | `payment`, `billDetail`, `addCreditNote`                                             |
| **More**      | `More.jsx`          | Admin back office: Security (PIN rotation), Adjustments ledger + **Apply**, Credit Notes + **Apply**, pause periods, live diagnostics, health check                                                       | `addAdj`, `addPause`, `changePin`, `addCreditNote`                             |

`App.jsx` is the mount point: `useAuth` → `useAppState` → `useAppHandlers` →
`ErrorBoundary` → `AppShell` → page + modals + `Toast`. The login screen is
rendered inside its own `ErrorBoundary` so even a login-page crash gets the
recovery card instead of a white screen.

---

## Core flows in detail

### 1. Login & session (`useAuth.js`)

1. Operator types the 6-digit PIN → `signInWithPassword({ email: OPERATOR_EMAIL, password: pin })`. **The PIN is the Supabase Auth password** of one confirmed operator account; Supabase owns hashing, salting, refresh tokens, and persistence.
2. On boot the hook validates the persisted session with `getUser()` (a real
   network round-trip — `getSession()` alone would trust an expired token),
   then re-reads the session for a fresh `access_token`.
3. `auth.isAuthenticated` (the session token) is only a **data-loading gate**.
4. API-layer auth failures (RLS `42501`, `PGRST301/302`, expired JWT) dispatch
   a window `auth:expired` event; the hook signs out instead of leaving a
   permanent spinner.
5. Missing env vars never crash the app: `supabaseClient.js` builds the client
   lazily and exposes `configError`, which the login screen renders as an
   alert.

### 2. Daily delivery (`lib/api/delivery.js`)

- **Generate** (`generateDailyLogsForDate`) runs **4 parallel queries**
  (customers, active subscriptions, pause periods, existing logs for the date)
  then batches inserts. It is strictly **subscription-centric**: milk type,
  qty, and schedule live on subscriptions — customers with no active
  subscription get no logs. For each active, unpaused customer it merges
  subscriptions into one planned row per **(brand, milk type)** (two brands of
  the same type → two rows, so each can be priced at its own rate), skips
  existing / paused / inactive / wrong-day cases, and upserts with
  `onConflict: "customer_id,date,brand_id,product"`. Brandless (legacy) rows
  are updated by id instead of going through the upsert, because `NULL` never matches in a
  unique index. Returns a summary (`created`, `skipped*`) that the handler
  toasts.
- **Toggle** (`updateLogEntry`): sets `delivered` (+qty/note) on one log, then
  refetches the day.
- **Extra delivery** (`addAdHocLog` → `record_ad_hoc_log_rpc`): a single
  transactional RPC that accumulates qty onto the row with the _same_ brand
  (`brand_id IS NOT DISTINCT FROM p_brand_id`), locked `FOR UPDATE`. A
  concurrent insert surfaces as a typed `CONFLICT` the operator can retry.
  The brand is recorded (e.g. a substitute during shortage) so billing prices
  it at that brand's rate.

### 3. Brands & per-brand pricing (`lib/api/imports.js`)

A subscription is **(customer, brand, milk type, qty, days)** — each brand
prices each milk type independently via the `brand_rates` table.

- `getBrands` FK-embeds `brand_rates(milk_type, rate_per_liter)` into each
  brand row.
- `BrandModal` edits brand + all rate rows together → `saveBrand` →
  **`save_brand_rpc(p_brand jsonb, p_rates jsonb)`** — one atomic upsert with
  **replace-all** rate semantics (the legacy `default_milk_type`/`rate_per_liter`
  columns are kept in sync for legacy pricing fallback). The client validates:
  name required, ≥1 rate, no duplicate milk types, rate ≥ 0 — and a brand with
  **zero rates is rejected** (it would silently price deliveries at ₹0).
- The legacy customer-default delivery path is gone; `daily_logs` identity is
  `(customer_id, date, brand_id, product)` with a NULL-safe unique expression
  index backing it, so brandless rows are never duplicated.

### 4. Subscriptions (`lib/api/subscriptions.js`)

- Multiple per customer; at most one **active** per (customer, brand, milk
  type) enforced by the partial unique index
  `uniq_sub_customer_brand_type_active` (a `23505` surfaces as a friendly
  "already has an active subscription for this brand and milk type").
- Save = validate (`validateSubscriptionForm` — brand required) → mapper →
  insert or version-CAS update. Delete = compare-and-set delete on `version`
  with an affected-count check (a Supabase delete can "succeed" while matching
  zero rows).
- History is **synthesized** (up to `CREATED` + `UPDATED` entries from
  `created_at`/`updated_at`) — there is no audit table yet.

### 5. Billing, payments, WhatsApp (`lib/api/billing.js`)

- **Generate** (`generateMonthlyBills` handler): billable set = customers who
  are `Active` **and** have ≥1 active subscription; fires
  `generate_month_bill_rpc(p_customer_id, p_month)` per customer via
  `Promise.allSettled`, reports partial failures, then refetches
  `getBills { month: billMonth }` (scoped — never all months). Inside the RPC,
  delivered logs are grouped by **(product, brand)** and priced at that
  brand's rate; a branded delivery with no matching rate **fails loudly**
  naming the brand + type — it is never priced with another brand's rate.
  Only NULL-brand (legacy) deliveries fall back to the legacy heuristic
  (most recent Active brand whose `default_milk_type` matches the product).
- **Lock/unlock**: `updateWithVersion("bills", …, { locked })` — compare-and-set
  on `version`; a zero-row match surfaces as `CONFLICT`.
- **Pay** (`recordPayment` → `record_payment_rpc`): one transaction that locks
  the bill, validates locked status + overpayment + customer match, inserts a
  `payments` row, and updates `amount_paid` + `status`. Idempotency: the
  handler mints a UUID key scoped to the **(billId, amount)** attempt —
  reused on a retry of the same submit (network-blip recovery deduplicated by
  the `payments_idempotency_key` uniqueness), re-minted for a different
  bill/amount. The RPC returns the updated bill; the handler patches state
  locally instead of a full refetch. Typed errors: `LOCKED`, `OVERPAY`.
- **WhatsApp share**: `getBillText` builds the message; `handlers.whatsapp`
  cleans the phone (`cleanPhone`, prepends `91` for 10-digit numbers) and
  opens `wa.me`. Missing phone / popup blocked / no pending bill are handled
  with a single clear toast each.

### 6. Adjustments & credit notes (`lib/api/adjustments.js`)

Ledger-grade, always via RPC:

- `addAdjustment` / `addCreditNote` insert an unapplied row (the adjustment
  handler resolves the customer's bill **for the viewed month** so the Apply
  button has a target; a missing bill is an actionable error, not a silent
  NULL).
- `apply_adjustment_rpc(p_adjustment_id, p_bill_id, p_version)` /
  `apply_credit_note_rpc(p_credit_note_id, p_bill_id, p_version)` apply the
  amount to the bill inside one transaction (row lock, already-applied and
  locked-bill checks, version CAS) and return the new paid/status. Typed
  errors: `CONFLICT`, `ALREADY_APPLIED`, `LOCKED`. Sign semantics: applying
  **reduces** the outstanding amount; there is exactly one code path per
  entity.

### 7. Imports / purchases (`lib/api/imports.js`)

- Draft lifecycle: `addMilkImport` inserts a row (status `Draft` — the DB
  default; the RPC-confirmed states are `Confirmed`/`Reconciled`), edit is a
  version-CAS update, `total_cost = qty × rate` is computed on write.
- **Confirm** / **delete** go through
  `confirm_milk_import_rpc` / `delete_milk_import_rpc` with
  `p_expected_version` — both validate exactly-one-row effects inside the
  transaction. If the import isn't in memory yet (stale list), the handler
  refetches once to recover the version instead of failing with "version is
  required".
- `getDailyInventory` (imported vs delivered vs remaining/shortage for a
  date) powers the Imports page **"By day" stock card** (wired 2026-11-10);
  the imported side counts **Confirmed imports only** — a Draft import is not
  verified stock and must not inflate Remaining. The Imports page also has
  **"By day"** and **"By date range"** filter modes (default window: first of
  the previous month → today) — pure client-side filtering over the unscoped
  `getMilkImports` fetch; no DB scoping unless row counts ever demand it
  (`idx_milk_imports_date` already exists for that day).

### 8. Pauses, diagnostics, PIN (`lib/api/admin.js`)

- **Pause periods** are plain inserts into `pause_periods`; the daily
  generator skips any customer whose pause spans the date.
- **Diagnostics** (`runDiagnostics`) is a live, per-item probe: DB
  connectivity (via `settings`), schema/API version (seeded values or the
  documented fallbacks), brand counts, and a check that every milk type in
  use is one the app can price. One failing probe never aborts the run.
- **Health check** returns `{ status, checks: [{ label, value, ok }] }` — the
  exact shape the More page's health card renders.
- **PIN rotation** re-authenticates with the current PIN
  (`signInWithPassword`) before `supabase.auth.updateUser({ password })`. PINs
  are never stored or compared in any public table.

### 9. Month rollover

`rollover_month_rpc(p_month)` exists (seeds bills for active subscriptions,
`ON CONFLICT DO NOTHING`) and `rolloverMonth` is registered in the DISPATCH
table, but it is **intentionally not wired to any UI** — month-end billing is
currently manual via **Generate Bills**. Future work: a scheduled Supabase
function (cron) calling this RPC.

---

## Data model

Source of truth for the deployed schema: `supabase/schema.sql` (generated
snapshot) and `src/lib/database.types.ts` (generated types). **13 tables**:

| Table           | Purpose                                                             | Notable                                                                            |
| :-------------- | :------------------------------------------------------------------ | :--------------------------------------------------------------------------------- |
| `customers`     | Identity only (name, phone, `delivery_address`, status, balance)    | `version` INT; legacy `product`/`daily_qty`/`delivery_days` deprecated             |
| `subscriptions` | (customer, brand, milk type, qty, delivery_days JSONB, is_active)   | `version`; partial unique `(customer, COALESCE(brand), milk_type) WHERE is_active` |
| `daily_logs`    | One row per (customer, date, **brand**, product)                    | NULL-safe unique expression index; no version (toggled freely)                     |
| `milk_brands`   | Supplier brands + legacy default type/rate                          | Legacy columns kept in sync by `save_brand_rpc`                                    |
| `brand_rates`   | The real rate table: `UNIQUE (brand_id, milk_type)`, `rate >= 0`    | Written **only** via `save_brand_rpc`                                              |
| `milk_imports`  | Purchases from suppliers                                            | `version`; confirm/delete via RPCs                                                 |
| `bills`         | Monthly bill per customer                                           | `version`, `locked`, `status` ∈ Draft/Unpaid/Partial/Paid                          |
| `payments`      | Payment ledger rows                                                 | `idempotency_key` UNIQUE — retries deduplicate                                     |
| `adjustments`   | Amount adjustments pending/`applied`                                | `version`; applied via RPC only                                                    |
| `credit_notes`  | Credit notes; `applied_to_bill_id` traces the bill actually reduced | `version`; applied via RPC only                                                    |
| `pause_periods` | Delivery pauses (start/end/reason)                                  | Consulted by the daily generator                                                   |
| `operators`     | Maps `user_id` (Supabase Auth uid) → operator                       | No client policy (`USING (false)`) — service-role only                             |
| `settings`      | Key/value (schema version, diagnostics)                             | Probed by diagnostics                                                              |

**Versioned entities** (frontend OCC): `customers`, `milk_imports`, `bills`,
`subscriptions`, `adjustments`, `credit_notes`. Every update/lock/unlock/
confirm/deactivate/delete passes the version and verifies exactly one row was
affected (`updateWithVersion` throws a typed `CONFLICT` on `PGRST116`).

**SECURITY DEFINER RPCs** (all `REVOKE ALL FROM PUBLIC`; `authenticated`
retains EXECUTE via `ALTER DEFAULT PRIVILEGES`; each authorizes the caller via
`is_operator()` and locks rows `FOR UPDATE`):

| RPC                       | Args                                               | Atomic operation                                |
| :------------------------ | :------------------------------------------------- | :---------------------------------------------- |
| `record_payment_rpc`      | bill_id, amount, mode, date, note, idempotency_key | Insert payment + update bill                    |
| `generate_month_bill_rpc` | customer_id, month                                 | Price delivered logs by (product, brand) → bill |
| `apply_adjustment_rpc`    | adjustment_id, bill_id, version                    | Apply adjustment to bill                        |
| `apply_credit_note_rpc`   | credit_note_id, bill_id, version                   | Apply credit note to bill                       |
| `confirm_milk_import_rpc` | import_id, expected_version                        | Confirm purchase                                |
| `delete_milk_import_rpc`  | import_id, expected_version                        | Delete purchase                                 |
| `record_ad_hoc_log_rpc`   | customer_id, date, qty, product, brand_id, reason  | Accumulate extra delivery                       |
| `rollover_month_rpc`      | month                                              | Seed month bills (not wired to UI; future cron) |
| `save_brand_rpc`          | brand jsonb, rates jsonb                           | Brand upsert + replace-all rates                |

`is_operator()` compares `auth.uid()` against the `operators` table — the
single gate for RLS and RPC authorization.

---

## Error handling layers

In the order they trigger:

1. **`safeFetch`** (`useEntityStore`) — initial loads fail soft: action name
   lands in `loadErrors[]`, the shell shows a banner with Retry.
2. **`useBusy`** — swallows re-entrant async calls (rapid double-taps) and
   filters React SyntheticEvents out of args. No toast, just ignored.
3. **Handler `try/catch`** — every mutation shows exactly one error/success
   toast (`showToast`).
4. **`ErrorBoundary`** (class) — wraps the app subtree **and** the login
   screen; renders a Reload / Sign-out-&-reload card with the error message.

Cross-cutting: `callApi` maps auth errors to a window `auth:expired` event →
`useAuth` signs out. Typed error codes (`CONFLICT`, `LOCKED`, `OVERPAY`,
`ALREADY_APPLIED`, `NOT_FOUND`, `AUTHZ`, `INVALID_CURRENT_PIN`) let handlers
show specific, actionable messages.

---

## Offline & PWA

- `public/sw.js` (vanilla service worker): cache-first for `/assets/*`
  (content-hashed bundles) and the shell files (`SHELL` list: `index.html`,
  `app.css`, `apply-dark-mode.js`, icons, manifest); **network-only for `/api`
  and `/functions`** (never cached — prevents data leakage); network-first
  with cache fallback for everything else.
- **Cache name is bumped on every shell/bundle-changing release** — the shell
  handler is strictly cache-first, so without a bump operators would keep
  running the previous build indefinitely. (The current value lives in
  `public/sw.js`; docs intentionally don't quote it.)
- `apply-dark-mode.js` is a classic (non-module) early script that applies the
  `.dark` class **before React paints** (FOUC fix); `AppShell` stays the
  source of truth for toggles.
- `manifest.json` makes the app installable on the operator's phone.
- `index.html` ships a strict **CSP**: self scripts/styles, Google Fonts,
  `connect-src` limited to `*.supabase.co` (HTTP + WSS), no blobs/eval. Any
  new external origin must be allowlisted there.

---

## Repository layout

```
src/
├── main.jsx                 # Mounts <App/> into #app-root
├── App.jsx                  # Auth gate → ErrorBoundary → Shell + Page + Modals
├── index.css                # "Ledger" design system: light/dark tokens +
│                             # all form/shell classes (.field, .btn-*, .card, …)
├── lib/
│   ├── supabaseClient.js    # Lazy client + configError (no module-eval throw)
│   ├── api.js               # 🔑 callApi + DISPATCH table (39 actions) + barrel
│   ├── api/                 # Per-domain implementations
│   │   ├── mappers.js       # mapXFromApi / mapXToApi (single-mapping rule)
│   │   ├── shared.js        # toArray, updateWithVersion, must, isAuthError, AuthzError, dayOfWeekKolkata
│   │   ├── customers.js / subscriptions.js / delivery.js / billing.js
│   │   ├── adjustments.js / imports.js / admin.js
│   ├── constants.js         # DAYS, MILK_TYPES, PAY_MODES, NEW_SUB_DEFAULTS, OPERATOR_EMAIL (status palette lives in ui.jsx)
│   ├── breakdowns.js        # Pure brand × type aggregations shared by Delivery + Imports
│   ├── filters.js           # Pure filters (customers/imports/bills + search/sort) + month options
│   ├── utils.js             # fmt, toNum, getToday (IST), getDaysAgoIST, shiftDate, cleanPhone, brandLabel, matchBrandByMilkType, generateKey
│   ├── validation.js        # Barrel: customer + import + subscription validators
│   ├── validation/          # customer.js, import.js, subscription.js
│   └── database.types.ts    # Generated types — never edit manually
├── hooks/
│   ├── useAuth.js           # Supabase Auth session + 6-digit PIN login
│   ├── useAppState.js       # Composition root (+ useDayTick)
│   ├── useAppUi / useEntityStore (+ useFilterState, hydration flags) / useAppDerived
│   ├── useAppHandlers.js    # Spreads 6 domain hooks
│   ├── useBusy.js           # Re-entrancy guard + SyntheticEvent filter
│   └── handlers/            # shared.js (useHelpers) + 6 domain handler hooks
├── pages/                   # 7 tab pages (+ *.test.jsx)
├── components/
│   ├── AppShell.jsx         # Header, bottom nav, load-error banner, dark mode, online badge
│   ├── AppPage.jsx / AppModals.jsx  # PAGE_RENDERERS / MODAL_RENDERERS tables
│   ├── ErrorBoundary.jsx / login.jsx / ui.jsx / forms.jsx
│   └── modals/              # 12 modal components (incl. shared.jsx)
├── assets/                  # Static images (vite.svg, react.svg, hero.png)
└── test/setup.js            # Vitest + Testing Library setup

public/                      # sw.js, register-sw.js, app.css, apply-dark-mode.js,
                             # manifest.json, icons/favicon, robots.txt
supabase/
├── schema.sql               # Generated present-state schema — never edit manually
└── migrations/              # Historical ledger (present since the 2026-11 baseline)
scripts/db-baseline.js       # db:baseline → two baseline migrations (schema + data)
e2e/                         # Playwright + live-DB Vitest suites (see e2e/README.md)
```

Root configs: `vite.config.js` (test + coverage + build chunks),
`eslint.config.js`, `cspell.json`, `playwright.config.js`. Build/test
artifacts (`dist/`, `coverage/`, `e2e-test-results/`) are git-ignored.

---

## Getting started

### Prerequisites

- **Node.js** >= 22.12.0 (enforced via `engines` in package.json), npm
- A **Supabase** project (cloud or local) with the schema applied
- Supabase CLI (for the `db:*` scripts)

### 1. Environment

`.env` is git-ignored — create it at the root:

```env
VITE_SUPABASE_URL=https://your-project-ref.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
# Optional: overrides the operator login email. Default: astamaniac001@gmail.com.
# Its auth.uid() must be seeded into the `operators` table for RLS/is_operator().
# VITE_OPERATOR_EMAIL=operator@example.com
# Required only for e2e / live-DB tests (tests self-skip without it):
# E2E_OPERATOR_PIN=123456
# E2E_OPERATOR_EMAIL=…   # optional override
```

The anon key is public by design — security lives in RLS and RPC
authorization, not in hiding frontend env vars.

### 2. Database

The repo tracks the **present-state schema** in `supabase/schema.sql` (there
are currently no committed migration files). Workflows:

```bash
supabase link --project-ref <ref>   # link your project once

npm run db:sync      # after any DB change: db:dump (schema.sql) + db:types (database.types.ts)

npm run db:new <name>   # start a new migration under supabase/migrations/
supabase db push        # apply pending migrations
npm run db:sync         # regenerate schema.sql + database.types.ts

npm run db:baseline     # stand up an existing linked DB as two baseline migrations
                        # (<ts>_initial_schema.sql + <ts+1>_seed_data.sql)
```

Rules: never use the Supabase Table Editor; never edit `schema.sql` /
`database.types.ts` by hand; never modify a committed/deployed migration
(create a corrective migration instead). Historical migrations are a ledger —
discover the schema from the generated artifacts only. See
[`AGENTS.md`](./AGENTS.md) §15 and the migration rules there.

### 3. Run

```bash
npm install
npm run dev      # http://localhost:5173
```

---

## npm scripts reference

| Script                                                                      | What it does                                                                                                        |
| :-------------------------------------------------------------------------- | :------------------------------------------------------------------------------------------------------------------ |
| `dev` / `build` / `preview`                                                 | Vite dev server / production build / local preview                                                                  |
| `lint` / `lint:fix`                                                         | ESLint (flat config; `no-console` warn with warn/error allowed)                                                     |
| `test` / `test:watch` / `test:coverage`                                     | Vitest (jsdom + Testing Library); coverage has enforced thresholds                                                  |
| `test:e2e` (+`:headed` / `:ui` / `:debug`)                                  | Playwright suite against the live app (system **Edge** channel; boots the dev server on :5173)                      |
| `test:db` / `test:db:watch`                                                 | Vitest integration tests against the live Supabase project (separate config; self-skips without `E2E_OPERATOR_PIN`) |
| `check-all`                                                                 | lint > test > build (OFFLINE - never touches Supabase; 2026-11-21 containment)                                        |
| `check-all:live`                                                            | `check-all` + `test:db` (MUTATES the linked project - run deliberately)                                          |
| `test:all`                                                                  | `check-all` + `test:e2e`                                                                                            |
| `advisor-all`                                                               | spellcheck → check-deps → fallow → test:coverage                                                                    |
| `audit` / `circular` / `cprettier` / `check-deps` / `spellcheck` / `fallow` | Advisory tools (run individually)                                                                                   |
| `db:new` / `db:push` / `db:dump` / `db:types` / `db:sync` / `db:baseline`   | Supabase schema workflow (see above)                                                                                |

Coverage thresholds (`vite.config.js`): global 10% lines/branches/functions/
statements with per-path floors — `src/lib/api.js` 40/30,
`src/lib/validation/**` 50/50, `src/hooks/handlers/**` 30/20. Coverage is
deliberately thin; don't assume the suite exercises a path you changed.

---

## Testing

- **Unit/integration** (`src/**/*.test.{js,jsx}`): Vitest + jsdom + Testing
  Library, globals on, setup in `src/test/setup.js`. Interaction tests cover
  destructive buttons, modal save paths, OCC callback shapes, and mapper
  regressions.
- **Live-DB integration** (`e2e/vitest/`): exercises `callApi` against the
  real project; anon-blocked checks run even without operator credentials;
  everything else self-skips without `E2E_OPERATOR_PIN`.
- **Browser e2e** (`e2e/*.test.js`): Playwright over the system **Edge**
  channel (no ~150 MB Chromium download needed) — connection/RLS gates,
  all-buttons, per-card controls, data rendering, and a full create → logs →
  bill → partial-payment lifecycle with RLS-aware cleanup.
- **Test-data isolation**: every e2e row is named with the `__e2e__` marker
  and cleaned up by the suites themselves. See `e2e/README.md`.

---

## Conventions & shared helpers

- **Shapes**: DB `snake_case` ↔ UI `camelCase`, converted exactly once in
  `lib/api/mappers.js` (`mapXFromApi` / `mapXToApi`). Double-mapping silently
  turns fields into `undefined`/`0`.
- **Statuses are PascalCase** (compared literally; the status color palette
  lives in `components/ui.jsx`, there is no `SC` export in `constants.js`):
  `Active`, `Paused`, `Inactive`, `Draft`, `Confirmed`, `Paid`, `Unpaid`,
  `Partial`, `Pending`, `Failed`, `Dead`, `Reconciled`, `Applied`,
  `Delivered`, `Skipped`.
- **JSONB arrays**: `delivery_days` is `[0..6]` (0 = Sun). `toArray()`
  normalizes array/JSON-string/comma-string; `JSON.stringify()` on write.
- **Dates & money**: `getToday()` / `getDaysAgoIST()` are Asia/Kolkata —
  never `new Date().toISOString()`. `fmt(n)` → `₹1,234.56`. Months are
  `YYYY-MM` (range-validated in domain code). `cleanPhone` + `91` prefix for
  WhatsApp.
- **useHelpers** (shared by all handler hooks, positional contracts):
  `showToast(msg, type)`, `executeApiAction(action, payload, successMsg,
getList, setList, mapFromApi, resKey)`, `handleFormAction(…)`,
  and `saveWithValidation(form, validateFn, handlers,
entityName)` which routes to `add<Entity>`/`update<Entity>` based on the
  presence of `form.id`.
- **One action = one mutation = at most one success toast**; duplicate calls
  from copy/paste leftovers are release blockers.
- `no-console` is `warn`-level (warn/error allowed); unused **args** prefixed
  `_` are ignored; new files under `lib/validation/` must be re-exported from
  `lib/validation.js`.

---

## Security model

- **RLS is the boundary.** Every table has `strict_auth_only_select/insert/
update/delete` policies gated on `is_operator()`; the `operators` table has
  no client policy at all. The anon key is public; a hostile authenticated
  non-operator must be unable to read or write anything.
- **RPC hardening**: every financial/mutating RPC is `SECURITY DEFINER` with
  `REVOKE ALL FROM PUBLIC`, operator authorization inside the function, safe
  `search_path`, row locks, and state validation. `anon` keeps no EXECUTE on
  functions (default privileges grant functions to `authenticated` and
  `service_role` only).
- **The `anon` table trap — now closed**: the 20261108185027 migration
  revoked the `ALTER DEFAULT PRIVILEGES` grants of **tables and sequences to
  `anon`** (they were open by default before). New tables therefore start
  closed: any migration that creates a table must enable + force RLS and
  grant explicitly to `authenticated`/`service_role` **in the same
  migration**.
- **Auth**: the 6-digit PIN is the Supabase Auth password of the operator
  account (`OPERATOR_EMAIL` in `constants.js`, env-overridable). Rotation
  re-authenticates first. Never weaken rate limiting, add bypass paths, log
  PINs/tokens, or store secrets in public tables.
- **Build**: production sourcemaps are disabled (they'd leak source + anon
  key); vendor chunks are split (`vendor-react`, `vendor-supabase`,
  `vendor-icons`).

---

## Deployment

Static hosting (Vercel / Netlify / Cloudflare Pages / similar):

```bash
npm run build     # → dist/
npm run preview   # verify the build locally
```

- Serve `index.html` for unknown routes (SPA fallback).
- Production reads the same `VITE_*` vars from the hosting provider's env.
- **Bump the service-worker `CACHE` name** in `public/sw.js` on any
  shell/bundle-changing release — the cache-first shell otherwise pins
  operators to the previous build.

---

## Known limitations & future work

1. **Single operator** — role-based multi-user (delivery personnel) would
   need role claims and dynamic provisioning; today's model is one
   `operators` row + one Auth account.
2. **Manual month-end billing** — a transactional `rollover_month_rpc`
   already exists but is not wired to the UI; a scheduled Supabase cron
   calling it is the natural next step.
3. **Subscription history is synthesized** from `created_at`/`updated_at`
   (up to two entries); a dedicated audit table would give full edit history.
4. **Coverage is thin** in `lib/api/` and startup paths — extend tests when
   changing those areas rather than trusting the green gate.

---

## Keeping these docs accurate

Both `README.md` and `AGENTS.md` describe the working tree, not intent. When
a change alters behavior, update both in the same commit, verify claims
against the code (a passing build is not proof), and never quote mutable
values (like the service-worker cache name) — describe the rule instead.
