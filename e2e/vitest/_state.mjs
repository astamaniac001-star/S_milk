// Throwaway: list current rows in each entity so I know what test data the
// untested-button Playwright tests will see when they drive the UI.
import { getOperatorClient } from "./_client.mjs";

const s = await getOperatorClient();

const addColumn = async (table, sel, label) => {
  const r = await s.from(table).select(sel).limit(3);
  console.log(`\n=== ${label} (${table}) ===`);
  console.log("error:", r.error && r.error.message);
  console.log(JSON.stringify(r.data, null, 2));
};

await addColumn(
  "customers",
  "id,name,phone,product,status,version",
  "customers",
);
await addColumn(
  "milk_brands",
  "id,brand_name,status,rate_per_liter,default_milk_type",
  "brands",
);
await addColumn(
  "milk_imports",
  "id,brand_name,milk_type,quantity,rate_per_liter,status,date,version",
  "imports",
);
await addColumn(
  "bills",
  "id,month,status,locked,amount,amount_paid,version",
  "bills",
);
await addColumn(
  "subscriptions",
  "id,customer_id,milk_type,qty,is_active,version",
  "subscriptions",
);
await addColumn(
  "adjustments",
  "id,bill_id,amount,reason,applied,version",
  "adjustments",
);
await addColumn(
  "pause_periods",
  "id,customer_id,start_date,end_date,reason",
  "pauses",
);
await addColumn(
  "credit_notes",
  "id,customer_id,bill_id,amount,reason,applied,version",
  "credit_notes",
);
