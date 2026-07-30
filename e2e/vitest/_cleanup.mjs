// Throwaway: delete leftover e2e test rows so the next full-lifecycle run
// starts clean. Mirrors cleanupAll() in integration-full-flow.test.js.
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";

const env = readFileSync(".env", "utf8").split(/\r?\n/).reduce((a, l) => {
  const i = l.indexOf("=");
  if (i < 0) return a;
  const k = l.slice(0, i).trim();
  let v = l.slice(i + 1).trim();
  if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
  a[k] = v;
  return a;
}, {});

const s = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY, {
  auth: { persistSession: false },
});

const { error: authErr } = await s.auth.signInWithPassword({
  email: env.E2E_OPERATOR_EMAIL || "astamaniac001@gmail.com",
  password: env.E2E_OPERATOR_PIN,
});
if (authErr) { console.log("auth error:", authErr.message); process.exit(1); }

const custs = await s.from("customers").select("id").like("name", "__e2e__%");
console.log("orphan customers:", custs.data);

for (const c of custs.data || []) {
  await s.from("daily_logs").delete().eq("customer_id", c.id);
  await s.from("subscriptions").delete().eq("customer_id", c.id);
  const bills = await s.from("bills").select("id").eq("customer_id", c.id);
  for (const b of bills.data || []) {
    await s.from("payments").delete().eq("bill_id", b.id);
    await s.from("adjustments").delete().eq("bill_id", b.id);
    await s.from("credit_notes").delete().eq("bill_id", b.id);
    await s.from("credit_notes").delete().eq("applied_to_bill_id", b.id);
  }
  await s.from("bills").delete().eq("customer_id", c.id);
  await s.from("pause_periods").delete().eq("customer_id", c.id);
  await s.from("customers").delete().eq("id", c.id);
}
console.log("done with customers");

// NOTE: do NOT delete the seeded __e2e__ ActiveBrand — the lifecycle test
// requires at least one Active brand to derive its bill rate from.
