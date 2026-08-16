# 🥛 Milk Delivery Admin (c1milk)

[![React](https://img.shields.io/badge/React-19.2-61DAFB?logo=react)](https://react.dev/)
[![Vite](https://img.shields.io/badge/Vite-8.1-646CFF?logo=vite)](https://vitejs.dev/)
[![Supabase](https://img.shields.io/badge/Supabase-PostgreSQL-3ECF8E?logo=supabase)](https://supabase.com/)
[![Status](https://img.shields.io/badge/Status-Production--Ready-brightgreen)](#)

An internal **Progressive Web App (PWA)** for a small milk-delivery business in
India. The operator uses it to manage customers, daily delivery schedules,
milk purchases from brands/suppliers (imports), and monthly billing with
WhatsApp share. It is **not** customer-facing — it's a single-operator admin
tool accessed from the operator's phone, installable as a PWA, designed to work
offline.

> **Status:** Production-Ready (Post-Audit Remediation Phases 1–6 Complete)

---

## ✨ Key Features

- **📅 Smart Daily Logging**: Automatically generates daily delivery logs based
  on active subscriptions or customer defaults. Intelligently skips paused or
  inactive customers.
- **🔄 Flexible Subscriptions**: Supports multiple, distinct delivery schedules
  per customer (e.g., different milk types, quantities, and specific days of
  the week).
- **💰 Atomic Financial Operations**: Payments, adjustments, bill generation,
  ad-hoc log accrual, import confirm/delete, and credit-note application use
  single-transaction PostgreSQL **SECURITY DEFINER RPCs** with row-level
  locking (`FOR UPDATE`) to prevent race conditions, double-counting, and
  partial ledger state. Real UUIDs enforce idempotency on retryable writes.
- **⏱️ Timezone Safety**: All date generation and day-of-week calculations use
  `Asia/Kolkata`, preventing critical off-by-one-day errors across different
  device timezones (see `getToday()` and `getDaysAgoIST()` in `src/lib/utils.js`).
- **🛡️ Optimistic Concurrency Control (OCC)**: Mutable entities (`customers`,
  `bills`, `milk_imports`, `subscriptions`) carry a `version INT` column; every
  update/delete verifies exactly one row was affected via compare-and-set.
- **🔐 Operator Auth**: The six-digit operator PIN is the Supabase Auth
  password of a single confirmed operator account. Supabase owns password
  hashing, salting, refresh tokens, and session persistence. PIN rotation
  re-authenticates the current PIN before calling `supabase.auth.updateUser`.
- **📱 PWA Ready**: Vanilla Service Worker (`public/sw.js`, currently `milk-v22`)
  for offline-first caching. Never caches `/api` or `/functions`.
- **🌙 Dark Mode**: Built-in theme switching using organized CSS variables.

---

## 🛠️ Tech Stack

| Category      | Technology |
| :---          | :--- |
| **Frontend**  | React 19.2, Vite 8.1 (JSX, no TypeScript) |
| **Icons**     | lucide-react 1.24 |
| **Backend / DB** | Supabase directly (no Node server) — `@supabase/supabase-js` v2.110 |
| **State Management** | Custom composable hooks (`useAppState`, `useEntityStore`, domain handlers) |
| **Routing**    | Tab-based (no react-router) |
| **Styling**    | CSS Variables, organized inline styles |
| **Testing**    | Vitest 4, jsdom, React Testing Library; Playwright for e2e |
| **Linting / Quality** | ESLint 10 (flat config), Prettier, CSpell, fallow, madge, depcheck |

---

## 🏗️ Architecture Highlights

The application follows a clean, modular architecture that strictly separates
UI, state, and business logic:

1. **All data ops go through `callApi(action, payload)`** in `src/lib/api.js`,
   which dispatches to per-domain modules under `src/lib/api/`. There is no
   REST backend and Supabase Auth is the only direct `supabase.*` exception.
2. **Centralized State**: `useAppState` orchestrates UI state (modals, toasts,
   active tabs) and includes a `useDayTick` hook that listens to
   `visibilitychange` and ticks every 60s to handle midnight rollover without a
   page refresh.
3. **Parallel Data Fetching**: `useEntityStore` fetches core date-independent
   entities in parallel on login/refresh, and refetches only the
   date-dependent reads (`getDailyLogs`, `getBills`) when the operator changes
   the selected date/month — avoiding redundant network calls.
4. **Derived State**: `useAppDerived` uses `useMemo` to compute filtered lists,
   total revenue, pending dues, and daily stats *only* when dependencies
   change.
5. **Thin Components**: Business logic lives in domain-specific handler hooks
   (`useBillingHandlers`, `useCustomerHandlers`, `useDeliveryHandlers`, etc.),
   all sharing `useHelpers()` for toast/execute/save validation. React
   components stay presentational and testable.

See `AGENTS.md` for the full architecture rules; it is the authoritative spec
for AI agents working in this repo.

---

## 🚀 Getting Started

### Prerequisites
- **Node.js** 20.x or higher
- **npm**
- A **Supabase** project (local or cloud)

### 1. Clone the Repository
```bash
git clone https://github.com/astamaniac001-star/S_milk.git
cd S_milk
```

### 2. Environment Setup
Create a `.env` file in the root directory with your Supabase credentials:
```env
VITE_SUPABASE_URL=https://your-project-ref.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key-here
# Optional: override the operator email used for 6-digit PIN sign-in.
# Defaults to astamaniac001@gmail.com. Its auth.uid() must be seeded into the
# `operators` table for RLS/`is_operator()` to grant access.
# VITE_OPERATOR_EMAIL=operator@example.com
```

### 3. Database Setup
The schema for this project is tracked in `supabase/schema.sql` (the generated
present-state snapshot). Apply it via the Supabase CLI — **do not** use the
Supabase Table Editor UI:

```bash
# From a fresh project: apply the committed migrations (rebuilds the current schema)
supabase db push

# Regenerate local type + schema artifacts after any schema change
npm run db:sync     # = db:dump (schema.sql) + db:types (database.types.ts)

# Capture an existing linked DB as two baseline migrations
# (supabase/migrations/<ts>_initial_schema.sql + <ts+1>_seed_data.sql):
npm run db:baseline
```

If you need to make a schema change, create a new migration rather than editing
schema artifacts by hand:

```bash
npm run db:new <descriptive_name>     # creates a new migration file
# edit the new file under supabase/migrations/
supabase db push                       # apply it
npm run db:sync                        # regenerate schema.sql + database.types.ts
```

> **Note:** Historical migrations under `supabase/migrations/` are a ledger and
> may contain superseded columns/policies. Always discover the current schema
> from `supabase/schema.sql` and `src/lib/database.types.ts`, not old
> migrations.

### 4. Install Dependencies & Run
```bash
npm install
npm run dev
```
The app will be available at `http://localhost:5173`.

---

## 🧪 Testing

The project uses Vitest with jsdom and React Testing Library. Coverage
thresholds are enforced separately via `test:coverage`; advisory checks
(spellcheck, depcheck, fallow) are available via `advisor-all`.

```bash
npm run test            # Vitest unit/integration run
npm run test:coverage   # with enforced coverage thresholds
npm run test:watch      # watch mode

npm run test:e2e        # Playwright end-to-end (needs E2E_* env, see e2e/README.md)
npm run test:db         # Vitest integration against the live Supabase project; self-skips when E2E_OPERATOR_PIN is unset
npm run test:all        # lint + db integration + unit tests + build + browser e2e (alias of check-all && test:e2e)
```

---

## 🔒 Security & Database Notes

- **Row Level Security (RLS)**: Enforced on all tables. `SELECT`/`INSERT`/
  `UPDATE`/`DELETE` policies all gate on `is_operator()`, which checks the
  caller's `auth.uid()` against the `operators` table. PostgreSQL permissive
  policies combine with `OR` — restrictive work must drop/replace broad
  policies in the same migration.
- **Financial Integrity**: Critical operations delegate to single-transaction
  SECURITY DEFINER functions (`record_payment_rpc`,
  `generate_month_bill_rpc`, `record_ad_hoc_log_rpc`, `confirm_milk_import_rpc`,
  `delete_milk_import_rpc`, `apply_adjustment_rpc`, `apply_credit_note_rpc`,
  `rollover_month_rpc`) that lock target rows (`FOR UPDATE`), validate business
  rules (locked bills, overpayment, wrong customer, ownership), and use a
  UUID idempotency key for retryable writes.
- **Auth**: Six-digit PIN is the Supabase Auth password of the confirmed
  operator account. The email is centralized in `src/lib/constants.js`
  (`OPERATOR_EMAIL`, env-overridable via `VITE_OPERATOR_EMAIL`). Supabase owns
  password hashing, salting, refresh tokens, and session persistence. Never
  weaken rate limiting or add bypass paths; never log PINs, passwords,
  sessions, or access tokens.

---

## 📦 Deployment

The app is optimized for static hosting (e.g., Vercel, Netlify, GitHub Pages,
Cloudflare Pages).

```bash
npm run build      # production build
npm run preview    # preview the build locally
```
*Note: Ensure your hosting provider is configured to serve `index.html` for all
unknown routes (SPA fallback).*

---

## 📌 Known Limitations & Future Enhancements

1. **Single Operator Auth**: The app relies on a single operator account.
   Scaling to multiple delivery personnel would require role-based access
   control and dynamic operator provisioning.
2. **Manual Month Rollover**: Automatic month-end billing is currently manual
   via the UI. *Future enhancement*: implement a Supabase scheduled function
   (cron) for true automated month-end billing — a `rollover_month_rpc`
   transactional RPC already exists to back it.
3. **Subscription History**: `getSubscriptionHistory` currently synthesizes up
   to two entries from `created_at`/`updated_at`. A dedicated audit table would
   give a full edit history.

---

## 📄 License

Internal use only. Proprietary and confidential.
