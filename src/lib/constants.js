// ── constants.js ──────────────────────────────────────────────────────────────
// Brand + palette constants shared across UI primitives and pages.

// Status → badge colors. Used by <Badge> to pick background/text.
// (audit 2026-11-09: removed the unused `SC` export — ui.jsx owns the
// dark-mode-aware status palette; this static copy had no consumers.)
// (audit 2026-11-27: removed the unused `BLUE`/`BLUE_L` indigo leftovers —
// the "Ledger" design system's accent is pine-green and lives in index.css
// tokens; nothing imported these.)

// Day-of-week labels (en-IN). Month names live inline in utils.js#monthLabel.
export const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

// Domain enumerations
export const MILK_TYPES = [
  "Full Cream",
  "Toned",
  "Double Toned",
  "Skimmed",
  "Standard",
  "Small",
  "A2",
];
// NOTE: the old `PRODUCTS` alias was removed — the customer form no longer
// carries a product field (milk type lives on subscriptions, which read
// MILK_TYPES directly).
export const PAY_MODES = [
  "Cash",
  "UPI",
  "PhonePe",
  "GPay",
  "Paytm",
  "Bank Transfer",
  "Cheque",
];

// Defaults for a NEW subscription — the same values the SubscriptionModal
// displays when its form is empty (1L Full Cream, Mon–Fri, active). Both
// entry points (Subscriptions tab "+ Add", Customers card "+ Sub") pass
// them as modal data so the visible defaults are the ones persisted.
export const NEW_SUB_DEFAULTS = {
  brandId: "",
  milkType: "Full Cream",
  qty: 1,
  deliveryDays: [1, 2, 3, 4, 5],
  isActive: true,
};

// Email used for Supabase Auth operator sign-in (rule §9 of AGENTS.md). The
// six-digit operator PIN is the Supabase Auth password of this confirmed
// account. Its auth.uid() must be seeded into the `operators` table for RLS
// (`is_operator()`) and the SECURITY DEFINER RPC authorizations to grant
// access. Kept here in a single location so login, PIN rotation, and any
// deployment replacement all reference the same value. Allow an env override
// so e2e integration runs (e2e/helpers/supabase.js#OPERATOR_EMAIL) can target
// a different operator email without a code change.
export const OPERATOR_EMAIL =
  import.meta.env?.VITE_OPERATOR_EMAIL || "astamaniac001@gmail.com";
