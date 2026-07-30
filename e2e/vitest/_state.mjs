// Throwaway: list current rows in each entity so I know what test data the
// untested-button Playwright tests will see when they drive the UI.
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

const addColumn = async (table, sel, label) => {
  const r = await s.from(table).select(sel).limit(3);
  console.log(`\n=== ${label} (${table}) ===`);
  console.log("error:", r.error && r.error.message);
  console.log(JSON.stringify(r.data, null, 2));
};

await addColumn("customers", "id,name,phone,product,status,version", "customers");
await addColumn("milk_brands", "id,brand_name,status,rate_per_liter,default_milk_type", "brands");
await addColumn("milk_imports", "id,brand_name,milk_type,quantity,rate_per_liter,status,date,version", "imports");
await addColumn("bills", "id,month,status,locked,amount,amount_paid,version", "bills");
await addColumn("subscriptions", "id,customer_id,milk_type,qty,is_active,version", "subscriptions");
await addColumn("adjustments", "id,bill_id,amount,reason,applied,version", "adjustments");
await addColumn("pause_periods", "id,customer_id,start_date,end_date,reason", "pauses");
await addColumn("credit_notes", "id,customer_id,bill_id,amount,reason,applied,version", "credit_notes");
