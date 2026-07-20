# Milk Delivery Admin (c1milk)

Internal Progressive Web App (PWA) for managing daily milk delivery schedules, customer subscriptions, inventory imports, and monthly billing.

## 🚨 Production Status
**Status:** Production-Ready (Post-Audit Remediation Phase 1-6)
**Database:** Supabase (PostgreSQL) with strict RLS and Atomic RPCs for financial operations.

## Tech Stack
- **Frontend:** React 19.2, Vite 8.1, Vanilla Service Worker
- **Backend:** Supabase (Direct client-side connection via `@supabase/supabase-js`)
- **State:** Custom composable hooks (`useAppState`, `useEntityStore`)
- **Styling:** CSS Variables (Dark Mode support), Inline Styles

## Local Development

### Prerequisites
- Node.js 20.x+
- A Supabase project with the schema applied (see `supabase/migrations/`)

### Setup
1. Clone the repository.
2. Create a `.env` file in the root directory:
   ```env
   VITE_SUPABASE_URL=https://your-project.supabase.co
   VITE_SUPABASE_ANON_KEY=your-anon-key