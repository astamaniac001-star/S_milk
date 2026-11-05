// lib/api/customers.js — getCustomers, addCustomer, updateCustomer,
// deactivateCustomer. (Subscription-domain actions live in subscriptions.js.)

import { supabase, updateWithVersion, must } from "./shared.js";
import { mapCustomerFromApi } from "./mappers.js";

export async function getCustomers(/* payload */) {
  const { data, error } = await supabase
    .from("customers")
    .select("*")
    .order("name");
  must(error);
  return { customers: data || [] };
}

export async function addCustomer(payload) {
  const { data, error } = await supabase
    .from("customers")
    .insert([
      {
        name: payload.name,
        phone: payload.phone,
        delivery_address: payload.deliveryAddress,
      },
    ])
    .select()
    .single();
  must(error);
  return { customerId: data.id };
}

export async function updateCustomer(payload) {
  // Subscription-centric model: only identity fields are written. The legacy
  // product/daily_qty/delivery_days columns are deprecated (DB defaults fill
  // them); status remains writable here (activate/deactivate lifecycle).
  const data = await updateWithVersion(
    "customers",
    payload.customerId,
    payload.expectedVersion ?? payload.version,
    {
      name: payload.name,
      delivery_address: payload.deliveryAddress,
      phone: payload.phone,
      status: payload.status,
    },
  );
  return { customerId: data.id, newVersion: data.version };
}

export async function deactivateCustomer(payload) {
  const { id, version } = payload;
  if (!id) throw new Error("id is required");
  if (version === undefined)
    throw new Error("customer version is required for OCC");

  // Rule §5 + §2 (DRY): reuse updateWithVersion. The `set_updated_at` trigger
  // maintains `updated_at`; no system-time write here.
  const data = await updateWithVersion("customers", id, version, {
    status: "Inactive",
  });
  return mapCustomerFromApi(data);
}
