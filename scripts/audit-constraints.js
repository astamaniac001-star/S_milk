// scripts/audit-constraints.mjs
//
// READ-ONLY remote assessment for the 20261121205118 migration's NOT VALID
// constraints (AGENTS rule: audit existing rows before validating; never
// silently repair financial data). Signs in as the operator, counts rows
// that would VIOLATE each constraint, and prints a go/no-go table for the
// VALIDATE migration.
//
// Usage: node scripts/audit-constraints.js
// Exit code 0 = every count is 0 (safe to VALIDATE); 1 = violations exist.
/* eslint-disable no-console -- CLI reporter; matches scripts/db-baseline.js */
import process from "node:process";
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

function readDotEnv() {
  try {
    const out = {};
    for (const rawLine of readFileSync(".env", "utf8").split(/\r?\n/)) {
      const line = rawLine.trim();
      if (!line || line.startsWith("#")) continue;
      const eq = line.indexOf("=");
      if (eq < 0) continue;
      out[line.slice(0, eq).trim()] = line
        .slice(eq + 1)
        .trim()
        .replace(/^["']|["']$/g, "");
    }
    return out;
  } catch {
    return {};
  }
}

const env = { ...readDotEnv(), ...process.env };
const URL = env.SUPABASE_URL || env.VITE_SUPABASE_URL;
const KEY = env.SUPABASE_ANON_KEY || env.VITE_SUPABASE_ANON_KEY;
const PIN = env.E2E_OPERATOR_PIN;
const EMAIL =
  env.E2E_OPERATOR_EMAIL || "astamaniac001@gmail.com";

if (!URL || !KEY || !PIN) {
  console.error(
    "Missing VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY / E2E_OPERATOR_PIN in .env",
  );
  process.exit(1);
}

const supabase = createClient(URL, KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const { error: authErr } = await supabase.auth.signInWithPassword({
  email: EMAIL,
  password: PIN,
});
if (authErr) {
  console.error(`operator login failed: ${authErr.message}`);
  process.exit(1);
}

// Count rows VIOLATING each forward-only constraint. Every probe is
// read-only (head:true counts — no row data leaves the project except the
// tiny pause-period date pairs compared in-memory).
const checks = [
  {
    name: "bills.chk_bills_month_format",
    run: () =>
      supabase
        .from("bills")
        .select("id", { count: "exact", head: true })
        .not("month", "match", "^\\d{4}-(0[1-9]|1[0-2])$"),
  },
  {
    name: "bills.chk_bills_core_fields",
    run: () =>
      supabase
        .from("bills")
        .select("id", { count: "exact", head: true })
        .or(
          "customer_id.is.null,amount.is.null,amount_paid.is.null,version.is.null",
        ),
  },
  {
    name: "adjustments.chk_adjustments_core_fields",
    run: () =>
      supabase
        .from("adjustments")
        .select("id", { count: "exact", head: true })
        .or("customer_id.is.null,amount.is.null,version.is.null"),
  },
  {
    name: "credit_notes.chk_credit_notes_core_fields",
    run: () =>
      supabase
        .from("credit_notes")
        .select("id", { count: "exact", head: true })
        .or("customer_id.is.null,amount.is.null,version.is.null"),
  },
  {
    name: "credit_notes.chk_credit_notes_amount_positive",
    run: () =>
      supabase
        .from("credit_notes")
        .select("id", { count: "exact", head: true })
        .or("amount.lte.0,amount.is.null"),
  },
  {
    name: "subscriptions.chk_subscriptions_core_fields",
    run: () =>
      supabase
        .from("subscriptions")
        .select("id", { count: "exact", head: true })
        .or("customer_id.is.null,qty.is.null,qty.lte.0,version.is.null"),
  },
  {
    name: "daily_logs.chk_daily_logs_core_fields",
    run: () =>
      supabase
        .from("daily_logs")
        .select("id", { count: "exact", head: true })
        .or("customer_id.is.null,qty.is.null,qty.lt.0"),
  },
  {
    name: "milk_imports.chk_milk_imports_core_fields",
    run: () =>
      supabase
        .from("milk_imports")
        .select("id", { count: "exact", head: true })
        .or(
          "quantity.is.null,quantity.lt.0,rate_per_liter.is.null,rate_per_liter.lt.0,total_cost.is.null,total_cost.lt.0,version.is.null",
        ),
  },
  {
    name: "milk_imports.chk_milk_imports_status",
    run: () =>
      supabase
        .from("milk_imports")
        .select("id", { count: "exact", head: true })
        .not("status", "in", "(Draft,Pending,Confirmed,Reconciled)"),
  },
  {
    name: "pause_periods.chk_pause_periods_range (orphan customer)",
    run: () =>
      supabase
        .from("pause_periods")
        .select("id", { count: "exact", head: true })
        .is("customer_id", null),
  },
  {
    name: "payments.chk_payments_idempotency_key_present",
    run: () =>
      supabase
        .from("payments")
        .select("id", { count: "exact", head: true })
        .is("idempotency_key", null),
  },
  {
    name: "brand_rates.chk_brand_rates_rate_positive",
    run: () =>
      supabase
        .from("brand_rates")
        .select("id", { count: "exact", head: true })
        .lte("rate_per_liter", 0),
  },
];

// Column-to-column comparison (end_date < start_date) is not expressible in
// PostgREST — fetch the bounded pairs and compare in JS.
async function pauseInversions() {
  const { data, error } = await supabase
    .from("pause_periods")
    .select("id,start_date,end_date")
    .not("end_date", "is", null);
  if (error) throw error;
  return (data || []).filter((p) => p.end_date < p.start_date).length;
}

let violations = 0;
console.log("\nConstraint-readiness assessment (READ-ONLY)\n");
for (const { name, run } of checks) {
  const { count, error } = await run();
  if (error) {
    console.log(`  ERROR  ${name}: ${error.message}`);
    violations += 1;
    continue;
  }
  const bad = count || 0;
  if (bad > 0) violations += 1;
  console.log(`  ${bad === 0 ? "  OK  " : "VIOLATION"}  ${name}: ${bad}`);
}
const inversions = await pauseInversions();
if (inversions > 0) violations += 1;
console.log(
  `  ${inversions === 0 ? "  OK  " : "VIOLATION"}  pause_periods.chk_pause_periods_range (inverted range): ${inversions}`,
);

console.log(
  violations === 0
    ? "\n✅ CLEAN — safe to apply the VALIDATE migration."
    : `\n❌ ${violations} constraint(s) have violating rows — DO NOT VALIDATE yet. Audit the rows above; repair deliberately or leave the constraints NOT VALID.`,
);
process.exit(violations === 0 ? 0 : 1);
