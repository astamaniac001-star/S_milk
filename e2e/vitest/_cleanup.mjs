// fallow-ignore-file unused-file
// Throwaway: delete leftover e2e test rows so the next full-lifecycle run
// starts clean. Mirrors cleanupAll() in integration-full-flow.test.js.
import { getOperatorClient } from "./_client.mjs";

const s = await getOperatorClient();

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
