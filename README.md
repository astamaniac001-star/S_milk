

# 🥛 Milk Delivery Admin (c1milk)

[![React](https://img.shields.io/badge/React-19.2-61DAFB?logo=react)](https://react.dev/)
[![Vite](https://img.shields.io/badge/Vite-8.1-646CFF?logo=vite)](https://vitejs.dev/)
[![Supabase](https://img.shields.io/badge/Supabase-PostgreSQL-3ECF8E?logo=supabase)](https://supabase.com/)
[![Status](https://img.shields.io/badge/Status-Production--Ready-brightgreen)](#)

An internal **Progressive Web App (PWA)** designed for milk delivery businesses to manage daily delivery schedules, customer subscriptions, inventory imports, and monthly billing with precision, reliability, and financial integrity.

> **Status:** Production-Ready (Post-Audit Remediation Phase 1-6 Complete)

---

## ✨ Key Features

- **📅 Smart Daily Logging**: Automatically generates daily delivery logs based on active subscriptions or customer defaults. Intelligently skips paused or inactive customers.
- **🔄 Flexible Subscriptions**: Supports multiple, distinct delivery schedules per customer (e.g., different milk types, quantities, and specific days of the week).
- **💰 Atomic Financial Operations**: Payments, adjustments, and bill generation use PostgreSQL **Atomic RPCs** with row-level locking (`FOR UPDATE`) to prevent race conditions and double-counting.
- **⏱️ Timezone Safety**: Explicitly uses `Asia/Kolkata` for all date generation and day-of-week calculations, preventing critical off-by-one-day errors across different device timezones.
- **🛡️ Optimistic Concurrency Control (OCC)**: Mutable entities (`customers`, `bills`, `imports`, `subscriptions`) use a `version` column to detect and prevent conflicting simultaneous updates.
- **🔐 Idempotency**: Financial and import operations utilize generated UUID keys to ensure network retries do not create duplicate records.
- **📱 PWA Ready**: Vanilla Service Worker implementation for offline resilience and app-like installation on mobile devices.
- **🌙 Dark Mode**: Built-in theme switching using organized CSS variables.

---

## 🛠️ Tech Stack

| Category | Technology |
| :--- | :--- |
| **Frontend** | React 19.2, Vite 8.1 |
| **Backend / DB** | Supabase (PostgreSQL) |
| **State Management** | Custom composable hooks (`useAppState`, `useEntityStore`, domain-specific handlers) |
| **Styling** | CSS Variables, organized inline styles |
| **Testing** | Vitest, React Testing Library |
| **Linting / Quality** | ESLint (Flat Config), Prettier, CSpell |

---

## 🏗️ Architecture Highlights

The application follows a clean, modular architecture that strictly separates UI, state, and business logic:

1. **Centralized State**: `useAppState` orchestrates UI state (modals, toasts, active tabs) and includes a `useDayTick` hook that listens to `visibilitychange` to gracefully handle midnight rollovers without requiring a page refresh.
2. **Parallel Data Fetching**: `useEntityStore` fetches and caches all core entities (customers, bills, logs, imports) from Supabase in parallel, with built-in error handling and manual refresh mechanisms.
3. **Derived State**: `useAppDerived` uses `useMemo` to compute expensive calculations (filtered lists, total revenue, pending dues, daily stats) *only* when dependencies change.
4. **Thin Components**: Business logic is encapsulated in domain-specific handler hooks (`useBillingHandlers`, `useCustomerHandlers`, `useDeliveryHandlers`, etc.), keeping React components purely presentational and highly testable.

---

## 🚀 Getting Started

### Prerequisites
- **Node.js** 20.x or higher
- **npm** or **pnpm**
- A **Supabase** project

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
```

### 3. Database Setup
Apply the database schema and seed data to your Supabase project:
1. Go to your Supabase Dashboard → SQL Editor.
2. Run the migrations in order from the `supabase/migrations/` directory:
   - `20260719181002_initial_schema.sql`
   - `20260719210833_initial_schema.sql`
   - `20260719210834_seed_data.sql`
   - `20260720013854_remove_custom_auth.sql`
   - `20260720014928_remove_custom_auth.sql`

### 4. Install Dependencies & Run
```bash
npm install
npm run dev
```
The app will be available at `http://localhost:5173`.

---

## 🧪 Testing

The project includes a robust Vitest configuration with coverage thresholds for critical, logic-heavy modules.

```bash
# Run all tests
npm run test

# Run tests with coverage report
npm run test:coverage

# Run tests in watch mode
npm run test:watch
```

---

## 🔒 Security & Database Notes

- **Row Level Security (RLS)**: Strictly enforced on *all* tables. Policies restrict access to `authenticated` users and validate the specific operator UUID via the `is_operator()` SQL function.
- **Financial Integrity**: Critical operations bypass standard ORM updates. Functions like `record_payment_rpc` and `generate_month_bill_rpc` lock target rows, validate business rules (e.g., preventing overpayment, checking if a bill is locked), and execute updates atomically.
- **Authentication**: Currently utilizes a secure, 6-digit PIN-based authentication flow mapped to a dedicated operator account (`operator@milk.local`).

---

## 📦 Deployment

The app is optimized for static hosting (e.g., Vercel, Netlify, GitHub Pages, Cloudflare Pages).

```bash
# Build for production
npm run build

# Preview the production build locally
npm run preview
```
*Note: Ensure your hosting provider is configured to serve `index.html` for all unknown routes (SPA fallback).*

---

## 📌 Known Limitations & Future Enhancements

1. **Single Operator Auth**: The app currently relies on a single hardcoded operator email/PIN. Scaling to multiple delivery personnel would require expanding the auth system to support role-based access control (RBAC) and dynamic operator provisioning.
2. **Manual Month Rollover**: The `useAutoMonthRollover` hook is currently disabled in `App.jsx`. Monthly bill generation is triggered manually via the UI. *Future enhancement*: Implement a Supabase Edge Function cron job for true automated month-end billing.
3. **Styling Evolution**: While the current CSS variable + inline style system is well-organized and functional, migrating to a utility-first framework (like Tailwind CSS) could further improve long-term maintainability and reduce bundle size.

---

## 📄 License

Internal use only. Proprietary and confidential.
```

### Why this is a massive improvement:
1. **Professional Badges**: Immediately communicates the tech stack and production status.
2. **Feature-First**: Highlights the *advanced* engineering choices (OCC, Atomic RPCs, Timezone Safety, Idempotency) that prove this isn't just a basic CRUD app, but a robust financial tool.
3. **Clear Architecture Section**: Explains *why* the custom hooks exist, making it much easier for new developers to onboard and understand the codebase.
4. **Actionable Setup**: Provides step-by-step database migration instructions, which were missing from the original.
5. **Honest Limitations**: Proactively addresses the single-operator auth and manual rollover, showing foresight and providing a clear roadmap for future iterations. 

You can copy and paste this directly into your `README.md` file! Let me know if you want to tweak any specific section.