// ── constants.js ──────────────────────────────────────────────────────────────
// Brand + palette constants shared across UI primitives and pages.

// Primary palette
export const BLUE = "#1e40af";
export const BLUE_L = "#dbeafe";

// Status → badge colors. Used by <Badge> to pick background/text.
export const SC = {
  Active: { bg: "#dcfce7", tx: "#166534" },
  Paused: { bg: "#fef3c7", tx: "#92400e" },
  Inactive: { bg: "#f3f4f6", tx: "#374151" },
  Draft: { bg: "#e0e7ff", tx: "#3730a3" },
  Confirmed: { bg: "#dcfce7", tx: "#166534" },
  Paid: { bg: "#dcfce7", tx: "#166534" },
  Unpaid: { bg: "#fee2e2", tx: "#991b1b" },
  Partial: { bg: "#fef3c7", tx: "#92400e" },
  // FIX (AI-1 Moderate 6): Standardized casing to PascalCase to match backend status strings
  Pending: { bg: "#fef9c3", tx: "#854d0e" },
  Failed: { bg: "#fee2e2", tx: "#991b1b" },
  Dead: { bg: "#fee2e2", tx: "#991b1b" },
  Reconciled: { bg: "#e0f2fe", tx: "#075985" },
  Applied: { bg: "#dcfce7", tx: "#166534" },
  Delivered: { bg: "#dcfce7", tx: "#166534" },
  Skipped: { bg: "#fee2e2", tx: "#991b1b" },
};

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
