// lib/api/imports.js — milk_imports CRUD + brands + daily inventory.
// `confirmMilkImport` and `deleteMilkImport` go through new SECURITY DEFINER
// RPCs (rule §5 — OCC must verify exactly one row affected).

import {
  supabase,
  toNum,
  getToday,
  must,
  updateWithVersion,
  AuthzError,
} from "./shared.js";

const mapRpcErr = (rpcError) => {
  if (!rpcError) return null;
  if (rpcError.message.includes("CONFLICT")) {
    const e = new Error(
      "This import was modified elsewhere. Please refresh and try again.",
    );
    e.code = "CONFLICT";
    return e;
  }
  if (rpcError.message.includes("NOT_FOUND")) {
    const e = new Error("Import not found. It may already be deleted.");
    e.code = "NOT_FOUND";
    return e;
  }
  if (rpcError.message.includes("Unauthorized")) {
    return new AuthzError(rpcError.message);
  }
  return null;
};

export async function getMilkImports(/* payload */) {
  const { data, error } = await supabase
    .from("milk_imports")
    .select("*")
    .order("date", { ascending: false });
  must(error);
  return { imports: data || [] };
}

export async function addMilkImport(payload) {
  const qty = toNum(payload.quantity);
  const rate = toNum(payload.ratePerLiter);
  const calculatedTotal = qty * rate;

  const { data, error } = await supabase
    .from("milk_imports")
    .insert([
      {
        brand_name: payload.brandName,
        milk_type: payload.milkType,
        quantity: qty,
        rate_per_liter: rate,
        total_cost: calculatedTotal,
        supplier_name: payload.supplierName,
        date: payload.date,
      },
    ])
    .select()
    .single();
  must(error);
  return { importId: data.id };
}

export async function updateMilkImport(payload) {
  const qty = toNum(payload.quantity);
  const rate = toNum(payload.ratePerLiter);
  const calculatedTotal = qty * rate;
  const data = await updateWithVersion(
    "milk_imports",
    payload.id,
    payload.expectedVersion ?? payload.version,
    {
      brand_name: payload.brandName,
      milk_type: payload.milkType,
      quantity: qty,
      rate_per_liter: rate,
      total_cost: calculatedTotal,
      supplier_name: payload.supplierName,
      date: payload.date,
    },
  );
  return { importId: data.id, newVersion: data.version };
}

export async function confirmMilkImport(payload) {
  const { importId, version } = payload;
  if (!importId) throw new Error("importId is required");
  if (version === undefined)
    throw new Error("import version is required for OCC");

  const { data: rpcResult, error: rpcError } = await supabase.rpc(
    "confirm_milk_import_rpc",
    { p_import_id: importId, p_expected_version: toNum(version) },
  );
  const mapped = mapRpcErr(rpcError);
  if (mapped) throw mapped;

  return {
    importId,
    status: rpcResult?.status || "Confirmed",
    newVersion: rpcResult?.newVersion,
    idempotent: rpcResult?.idempotent || false,
  };
}

export async function deleteMilkImport(payload) {
  const { importId, version } = payload;
  if (!importId) throw new Error("importId is required");
  if (version === undefined)
    throw new Error("import version is required for OCC");

  const { error: rpcError } = await supabase.rpc("delete_milk_import_rpc", {
    p_import_id: importId,
    p_expected_version: toNum(version),
  });
  const mapped = mapRpcErr(rpcError);
  if (mapped) throw mapped;

  return { importId, deleted: true };
}

export async function getBrands(/* payload */) {
  const { data, error } = await supabase
    .from("milk_brands")
    .select("*")
    .order("brand_name");
  must(error);
  return { brands: data || [] };
}

export async function addMilkBrand(payload) {
  const { data, error } = await supabase
    .from("milk_brands")
    .insert([
      {
        brand_name: payload.brandName,
        supplier_name: payload.supplierName,
        supplier_phone: payload.supplierPhone,
        default_milk_type: payload.defaultMilkType,
        rate_per_liter: toNum(payload.ratePerLiter),
        status: "Active",
      },
    ])
    .select()
    .single();
  must(error);
  return { brandId: data.id };
}

export async function getDailyInventory(payload) {
  const date = payload.date || getToday();
  const [impRes, logRes] = await Promise.all([
    supabase.from("milk_imports").select("quantity").eq("date", date),
    supabase.from("daily_logs").select("qty, delivered").eq("date", date),
  ]);
  must(impRes.error);
  must(logRes.error);
  const totalImported = (impRes.data || []).reduce(
    (s, i) => s + toNum(i.quantity),
    0,
  );
  const totalDelivered = (logRes.data || [])
    .filter((l) => l.delivered)
    .reduce((s, l) => s + toNum(l.qty), 0);
  const rawRemaining = totalImported - totalDelivered;
  return {
    date,
    totalImported,
    totalDelivered,
    remaining: Math.max(0, rawRemaining),
    shortage: rawRemaining < 0 ? Math.abs(rawRemaining) : 0,
  };
}
