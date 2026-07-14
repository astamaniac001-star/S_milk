
import { supabase } from "./supabaseClient.js";

const toNum = (val) => {
  if (val === null || val === undefined || val === "") return 0;
  const n = Number(val);
  return isNaN(n) ? 0 : n;
};

const toArray = (val) => {
  if (Array.isArray(val)) return val;
  if (typeof val === "string" && val.trim() !== "") {
    try {
      const parsed = JSON.parse(val);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return val.includes(",") ? val.split(",").map((s) => s.trim()).filter(Boolean) : [];
    }
  }
  return [];
};

const generateKey = () => `${Date.now()}-${Math.random().toString(36).substring(2, 10)}`;

function nextMonthStart(month) {
  const [y, m] = String(month).split("-").map(Number);
  const ny = m === 12 ? y + 1 : y;
  const nm = m === 12 ? 1 : m + 1;
  return `${ny}-${String(nm).padStart(2, "0")}-01`;
}

const AUTH_ERROR_CODES = new Set(["42501", "PGRST301", "PGRST302"]);
function isAuthError(err) {
  return !!err && (AUTH_ERROR_CODES.has(err.code) || /jwt/i.test(err.message || ""));
}

async function updateWithVersion(table, id, expectedVersion, patch) {
  const ev = toNum(expectedVersion) || 1;
  const { data, error } = await supabase
    .from(table)
    .update({ ...patch, version: ev + 1 })
    .eq("id", id)
    .eq("version", ev)
    .select()
    .single();
  if (error) {
    if (error.code === "PGRST116") {
      const conflict = new Error("This record was changed elsewhere. Please refresh and try again.");
      conflict.code = "CONFLICT";
      throw conflict;
    }
    throw error;
  }
  return data;
}

function must(error) {
  if (error) throw error;
}

export function mapCustomerFromApi(c) {
  return {
    id: c.id, name: c.name, address: c.delivery_address, phone: c.phone,
    status: c.status, product: c.product, qty: toNum(c.daily_qty),
    deliveryDays: toArray(c.delivery_days), balance: toNum(c.balance), version: toNum(c.version || 1),
  };
}
export function mapBillFromApi(b) {
  return {
    id: b.id, custId: b.customer_id, month: b.month, amount: toNum(b.amount),
    paid: toNum(b.amount_paid), status: b.status, locked: !!b.locked,
    due: b.due_date, version: toNum(b.version || 1),
  };
}
export function mapImportFromApi(i) {
  return {
    id: i.id, brand: i.brand_name, type: i.milk_type, qty: toNum(i.quantity),
    rate: toNum(i.rate_per_liter), total: toNum(i.total_cost), invoice: i.invoice_number,
    supplier: i.supplier_name, date: i.date, status: i.status, version: toNum(i.version || 1),
  };
}
export function mapLogFromApi(l) {
  return {
    id: l.id, custId: l.customer_id, date: l.date, delivered: !!l.delivered,
    qty: toNum(l.qty), product: l.product, note: l.note,
  };
}
export function mapAdjustmentFromApi(a) {
  return {
    adjustmentId: a.id, billId: a.bill_id, customerId: a.customer_id,
    amount: toNum(a.amount), reason: a.reason, applied: !!a.applied, date: a.date,
  };
}
export function mapPauseFromApi(p) {
  return { id: p.id, custId: p.customer_id, start: p.start_date, end: p.end_date, reason: p.reason };
}
export function mapBrandFromApi(b) {
  return {
    id: b.id, name: b.brand_name, status: b.status, supplier: b.supplier_name,
    phone: b.supplier_phone, defaultMilkType: b.default_milk_type, rate: toNum(b.rate_per_liter),
  };
}
export function mapSubscriptionFromApi(s) {
  return {
    id: s.id, customerId: s.customer_id, milkType: s.milk_type, qty: toNum(s.qty),
    deliveryDays: toArray(s.delivery_days), isActive: !!s.is_active, version: toNum(s.version || 1),
  };
}
export function mapCreditNoteFromApi(c) {
  return {
    id: c.id, customerId: c.customer_id, billId: c.bill_id, amount: toNum(c.amount),
    reason: c.reason, applied: !!c.applied, date: c.date,
  };
}

export function mapCustomerToApi(form) {
  return {
    customerId: form.id || undefined,
    expectedVersion: form.version,
    name: form.name,
    deliveryAddress: form.address,
    phone: form.phone,
    product: form.product,
    dailyQty: form.qty,
    deliveryDays: form.deliveryDays,
    status: form.status,
    idempotencyKey: form.id ? undefined : generateKey(),
  };
}
export function mapImportToApi(form) {
  const out = {
    brandName: form.brand, milkType: form.type, quantity: Number(form.qty),
    ratePerLiter: Number(form.rate), totalCost: Number(form.total),
    invoiceNumber: form.invoice, supplierName: form.supplier, date: form.date,
  };
  if (form.id) { out.id = form.id; out.expectedVersion = form.version; }
  else { out.idempotencyKey = generateKey(); }
  return out;
}
export function mapPaymentToApi(billId, amount, opts = {}) {
  return {
    billId, amount: Number(amount), mode: opts.mode || "Cash",
    date: opts.date, note: opts.note, idempotencyKey: generateKey(),
  };
}

export async function verifyPIN(pin) {
  const { data, error } = await supabase.from("settings").select("value").eq("key", "PIN").single();
  if (error || !data) {
    const e = new Error("PIN is not configured. Contact an administrator.");
    e.code = "PIN_NOT_CONFIGURED";
    throw e;
  }
  if (String(data.value).trim() !== String(pin).trim()) {
    const e = new Error("Incorrect PIN");
    e.code = "INVALID_PIN";
    throw e;
  }
  const token = crypto.randomUUID();
  sessionStorage.setItem("token", token);
  return { token };
}

export async function callApi(action, payload = {}) {
  const result = { data: {} };
  try {
    switch (action) {
      case "verifyPIN":
        result.data = await verifyPIN(payload.pin);
        break;

      case "getCustomers": {
        const { data, error } = await supabase.from("customers").select("*").order("name");
        must(error);
        result.data = { customers: data || [] };
        break;
      }
      case "addCustomer": {
        const { data, error } = await supabase.from("customers").insert([{
          name: payload.name, phone: payload.phone, delivery_address: payload.deliveryAddress,
          product: payload.product, daily_qty: toNum(payload.dailyQty),
          delivery_days: JSON.stringify(payload.deliveryDays || [0, 1, 2, 3, 4, 5, 6]),
        }]).select().single();
        must(error);
        result.data = { customerId: data.id };
        break;
      }
      case "updateCustomer": {
        const data = await updateWithVersion("customers", payload.customerId, payload.expectedVersion ?? payload.version, {
          name: payload.name, delivery_address: payload.deliveryAddress, phone: payload.phone,
          product: payload.product, daily_qty: toNum(payload.dailyQty),
          delivery_days: JSON.stringify(payload.deliveryDays), status: payload.status,
        });
        result.data = { customerId: data.id, newVersion: data.version };
        break;
      }
      case "deactivateCustomer": {
        const { error } = await supabase.from("customers").update({ status: "Inactive" }).eq("id", payload.customerId);
        must(error);
        break;
      }

      case "getDailyLogs": {
        let q = supabase.from("daily_logs").select("*");
        if (payload.date) q = q.eq("date", payload.date);
        const { data, error } = await q.order("date", { ascending: false });
        must(error);
        result.data = { logs: data || [] };
        break;
      }
      case "updateLogEntry": {
        const { error } = await supabase.from("daily_logs").update({
          delivered: payload.delivered, qty: toNum(payload.qty), note: payload.note,
        }).eq("id", payload.logId);
        must(error);
        break;
      }
      case "bulkUpsertLogs": {
        const rows = payload.logs.map((l) => ({
          customer_id: l.customerId, date: l.date, product: l.product || "Full Cream",
          qty: toNum(l.qty), delivered: !!l.delivered, note: l.note || "",
        }));
        const { error } = await supabase.from("daily_logs").upsert(rows, { onConflict: "customer_id,date" });
        must(error);
        result.data = { saved: rows.length };
        break;
      }
      case "generateDailyLogsForDate": {
        const { date } = payload;
        if (!date) throw new Error("date is required");
        const dow = new Date(`${date}T00:00:00`).getDay();

        const [custRes, subRes, pauseRes, logRes] = await Promise.all([
          supabase.from("customers").select("id, status"),
          supabase.from("subscriptions").select("*").eq("is_active", true),
          supabase.from("pause_periods").select("customer_id, start_date, end_date"),
          supabase.from("daily_logs").select("customer_id").eq("date", date),
        ]);
        must(custRes.error); must(subRes.error); must(pauseRes.error); must(logRes.error);

        const existing = new Set((logRes.data || []).map((l) => l.customer_id));
        const subsByCustomer = new Map();
        for (const s of subRes.data || []) {
          if (!subsByCustomer.has(s.customer_id)) subsByCustomer.set(s.customer_id, []);
          subsByCustomer.get(s.customer_id).push(s);
        }
        const paused = new Set(
          (pauseRes.data || [])
            .filter((p) => p.start_date <= date && (!p.end_date || p.end_date >= date))
            .map((p) => p.customer_id),
        );

        let created = 0, skippedExisting = 0, skippedPaused = 0, skippedWrongDay = 0, skippedInactiveCust = 0;
        const toInsert = [];
        for (const c of custRes.data || []) {
          if (existing.has(c.id)) { skippedExisting++; continue; }
          if (c.status !== "Active") { skippedInactiveCust++; continue; }
          const match = (subsByCustomer.get(c.id) || []).find((s) => toArray(s.delivery_days).map(Number).includes(dow));
          if (!match) { skippedWrongDay++; continue; }
          if (paused.has(c.id)) { skippedPaused++; continue; }
          toInsert.push({
            customer_id: c.id, date, product: match.milk_type || "Full Cream",
            qty: toNum(match.qty), delivered: true, note: "Auto-generated",
          });
        }
        if (toInsert.length) {
          const { error } = await supabase.from("daily_logs").insert(toInsert);
          must(error);
          created = toInsert.length;
        }
        result.data = { created, skippedExisting, skippedPaused, skippedWrongDay, skippedInactiveCust };
        break;
      }
      case "addAdHocLog": {
        const { customerId, date, qty, reason, product } = payload;
        if (!customerId || !date) throw new Error("customerId and date are required");
        const addQty = toNum(qty);
        const note = reason ? `Extra: ${reason}` : "Extra delivery";

        const { data: existingLog, error: selErr } = await supabase
          .from("daily_logs").select("*").eq("customer_id", customerId).eq("date", date).maybeSingle();
        must(selErr);

        if (existingLog) {
          const { data, error } = await supabase.from("daily_logs").update({
            qty: toNum(existingLog.qty) + addQty,
            delivered: true,
            note: existingLog.note ? `${existingLog.note} | ${note}` : note,
          }).eq("id", existingLog.id).select().single();
          must(error);
          result.data = { logId: data.id, qty: data.qty };
        } else {
          const { data, error } = await supabase.from("daily_logs").insert([{
            customer_id: customerId, date, product: product || "Full Cream",
            qty: addQty, delivered: true, note,
          }]).select().single();
          must(error);
          result.data = { logId: data.id, qty: data.qty };
        }
        break;
      }

      case "getBills": {
        const { data, error } = await supabase.from("bills").select("*").order("month", { ascending: false });
        must(error);
        result.data = { bills: data || [] };
        break;
      }
      case "lockBill": {
        const { error } = await supabase.from("bills").update({ locked: true }).eq("id", payload.billId);
        must(error);
        break;
      }
      case "unlockBill": {
        const { error } = await supabase.from("bills").update({ locked: false }).eq("id", payload.billId);
        must(error);
        break;
      }
      case "recordPayment": {
        const { billId, amount } = payload;
        if (!billId || !(toNum(amount) > 0)) throw new Error("A valid billId and amount are required");

        const { data: bill, error: billErr } = await supabase.from("bills").select("*").eq("id", billId).single();
        must(billErr);
        if (bill.locked) {
          const e = new Error("This bill is locked."); e.code = "LOCKED"; throw e;
        }
        const newPaid = toNum(bill.amount_paid) + toNum(amount);
        const status = newPaid >= toNum(bill.amount) ? "Paid" : newPaid > 0 ? "Partial" : "Unpaid";

        const { data, error } = await supabase.from("bills")
          .update({ amount_paid: newPaid, status }).eq("id", billId).select().single();
        must(error);
        result.data = { billId: data.id, amountPaid: data.amount_paid, status: data.status };
        break;
      }
      case "generateMonthBill": {
        const { customerId, month, ratePerLiter } = payload;
        if (!customerId || !month) throw new Error("customerId and month are required");
        const rate = toNum(ratePerLiter);

        const { data: logs, error: logsErr } = await supabase
          .from("daily_logs").select("qty")
          .eq("customer_id", customerId).eq("delivered", true)
          .gte("date", `${month}-01`).lt("date", nextMonthStart(month));
        must(logsErr);
        const totalQty = (logs || []).reduce((s, l) => s + toNum(l.qty), 0);
        const amount = Math.round(totalQty * rate * 100) / 100;

        const { data: existing, error: exErr } = await supabase
          .from("bills").select("*").eq("customer_id", customerId).eq("month", month).maybeSingle();
        must(exErr);

        if (existing?.locked) {
          result.data = { billId: existing.id, amount: existing.amount, skipped: true, reason: "locked" };
          break;
        }

        const paid = toNum(existing?.amount_paid);
        const status = paid >= amount && amount > 0 ? "Paid" : paid > 0 ? "Partial" : "Unpaid";
        const row = { customer_id: customerId, month, amount, amount_paid: paid, status };

        let saved;
        if (existing) {
          const { data, error } = await supabase.from("bills")
            .update({ ...row, version: toNum(existing.version || 1) + 1 })
            .eq("id", existing.id).select().single();
          must(error);
          saved = data;
        } else {
          const { data, error } = await supabase.from("bills").insert([row]).select().single();
          must(error);
          saved = data;
        }
        result.data = { billId: saved.id, amount: saved.amount, totalQty };
        break;
      }
      case "getBillText": {
        const { billId } = payload;
        if (!billId) throw new Error("billId is required");
        const { data: bill, error: billErr } = await supabase.from("bills").select("*").eq("id", billId).single();
        must(billErr);
        const { data: cust } = await supabase.from("customers").select("name").eq("id", bill.customer_id).maybeSingle();
        const pending = toNum(bill.amount) - toNum(bill.amount_paid);
        const text = `Hi ${cust?.name || "there"}, your milk bill for ${bill.month} is ` +
          `\u20B9${toNum(bill.amount).toFixed(2)}. Paid so far: \u20B9${toNum(bill.amount_paid).toFixed(2)}. ` +
          (pending > 0 ? `Pending: \u20B9${pending.toFixed(2)}.` : "Fully paid — thank you!");
        result.data = { text };
        break;
      }

      case "getAdjustments": {
        const { data, error } = await supabase.from("adjustments").select("*").order("created_at", { ascending: false });
        must(error);
        result.data = { adjustments: data || [] };
        break;
      }
      case "addAdjustment": {
        const { data, error } = await supabase.from("adjustments").insert([{
          customer_id: payload.customerId, bill_id: payload.billId, amount: toNum(payload.amount),
          reason: payload.reason, applied: false, date: payload.date,
        }]).select().single();
        must(error);
        result.data = { adjustmentId: data.id };
        break;
      }
      case "applyAdjustment": {
        const { adjustmentId, billId } = payload;
        if (!adjustmentId) throw new Error("adjustmentId is required");

        if (billId) {
          const { data: adj, error: adjErr } = await supabase.from("adjustments").select("*").eq("id", adjustmentId).single();
          must(adjErr);
          const { data: bill, error: billErr } = await supabase.from("bills").select("*").eq("id", billId).single();
          must(billErr);
          if (bill.locked) {
            const e = new Error("Cannot apply an adjustment to a locked bill."); e.code = "LOCKED"; throw e;
          }
          const newAmount = toNum(bill.amount) + toNum(adj.amount);
          const paid = toNum(bill.amount_paid);
          const status = paid >= newAmount && newAmount > 0 ? "Paid" : paid > 0 ? "Partial" : "Unpaid";
          const { error: updErr } = await supabase.from("bills").update({ amount: newAmount, status }).eq("id", billId);
          must(updErr);
        }

        const { error } = await supabase.from("adjustments").update({ applied: true }).eq("id", adjustmentId);
        must(error);
        result.data = { adjustmentId, billId: billId || null };
        break;
      }
      case "getCreditNotes": {
        const { data, error } = await supabase.from("credit_notes").select("*").order("created_at", { ascending: false });
        must(error);
        result.data = { creditNotes: data || [] };
        break;
      }
      case "addCreditNote": {
        const { data, error } = await supabase.from("credit_notes").insert([{
          customer_id: payload.customerId, bill_id: payload.billId || null, amount: toNum(payload.amount),
          reason: payload.reason, applied: false, date: payload.date,
        }]).select().single();
        must(error);
        result.data = { creditNoteId: data.id };
        break;
      }

      case "getMilkImports": {
        const { data, error } = await supabase.from("milk_imports").select("*").order("date", { ascending: false });
        must(error);
        result.data = { imports: data || [] };
        break;
      }
      case "addMilkImport": {
        const { data, error } = await supabase.from("milk_imports").insert([{
          brand_name: payload.brandName, milk_type: payload.milkType, quantity: toNum(payload.quantity),
          rate_per_liter: toNum(payload.ratePerLiter), total_cost: toNum(payload.totalCost),
          invoice_number: payload.invoiceNumber, supplier_name: payload.supplierName, date: payload.date,
        }]).select().single();
        must(error);
        result.data = { importId: data.id };
        break;
      }
      case "updateMilkImport": {
        const data = await updateWithVersion("milk_imports", payload.id, payload.expectedVersion ?? payload.version, {
          brand_name: payload.brandName, milk_type: payload.milkType, quantity: toNum(payload.quantity),
          rate_per_liter: toNum(payload.ratePerLiter), total_cost: toNum(payload.totalCost),
          invoice_number: payload.invoiceNumber, supplier_name: payload.supplierName, date: payload.date,
        });
        result.data = { importId: data.id, newVersion: data.version };
        break;
      }
      case "confirmMilkImport": {
        const { error } = await supabase.from("milk_imports").update({ status: "Confirmed" }).eq("id", payload.importId);
        must(error);
        break;
      }
      case "deleteMilkImport": {
        const { error } = await supabase.from("milk_imports").delete().eq("id", payload.importId);
        must(error);
        break;
      }
      case "getBrands": {
        const { data, error } = await supabase.from("milk_brands").select("*").order("brand_name");
        must(error);
        result.data = { brands: data || [] };
        break;
      }
      case "addMilkBrand": {
        const { data, error } = await supabase.from("milk_brands").insert([{
          brand_name: payload.brandName, supplier_name: payload.supplierName,
          supplier_phone: payload.supplierPhone, default_milk_type: payload.defaultMilkType,
          rate_per_liter: toNum(payload.ratePerLiter),
          status: "Active",
        }]).select().single();
        must(error);
        result.data = { brandId: data.id };
        break;
      }

      case "getPauses": {
        const { data, error } = await supabase.from("pause_periods").select("*").order("created_at", { ascending: false });
        must(error);
        result.data = { pauses: data || [] };
        break;
      }
      case "addPausePeriod": {
        const { error } = await supabase.from("pause_periods").insert([{
          customer_id: payload.customerId, start_date: payload.startDate,
          end_date: payload.endDate, reason: payload.reason,
        }]);
        must(error);
        break;
      }
      case "getSubscriptions": {
        const { data, error } = await supabase.from("subscriptions").select("*");
        must(error);
        result.data = { subscriptions: data || [] };
        break;
      }
      case "saveSubscription": {
        if (payload.id) {
          const data = await updateWithVersion("subscriptions", payload.id, payload.expectedVersion ?? payload.version, {
            milk_type: payload.milkType, qty: toNum(payload.qty),
            delivery_days: JSON.stringify(payload.deliveryDays), is_active: payload.isActive,
          });
          result.data = { subscriptionId: data.id, newVersion: data.version };
        } else {
          const { data, error } = await supabase.from("subscriptions").insert([{
            customer_id: payload.customerId, milk_type: payload.milkType, qty: toNum(payload.qty),
            delivery_days: JSON.stringify(payload.deliveryDays),
            is_active: payload.isActive !== undefined ? payload.isActive : true,
          }]).select().single();
          must(error);
          result.data = { subscriptionId: data.id };
        }
        break;
      }
      case "getSubscriptionHistory": {
        const { subscriptionId } = payload;
        if (!subscriptionId) throw new Error("subscriptionId is required");
        const { data: sub, error } = await supabase.from("subscriptions").select("*").eq("id", subscriptionId).maybeSingle();
        must(error);
        const history = [];
        if (sub?.created_at) {
          history.push({
            id: `${sub.id}-created`, action: "CREATED",
            details: `${sub.milk_type || "Subscription"} · ${toNum(sub.qty)}L`,
            timestamp: sub.created_at,
          });
        }
        if (sub?.updated_at && sub.updated_at !== sub.created_at) {
          history.push({
            id: `${sub.id}-updated`, action: "UPDATED",
            details: `Now ${sub.milk_type || ""} · ${toNum(sub.qty)}L · v${sub.version || 1}`,
            timestamp: sub.updated_at,
          });
        }
        result.data = { history };
        break;
      }

      case "runDiagnostics": {
        const { error } = await supabase.from("settings").select("key").limit(1);
        must(error);
        result.data = { status: "OK" };
        break;
      }
      case "healthCheck": {
        const { error } = await supabase.from("settings").select("key").limit(1);
        must(error);
        result.data = { status: "Healthy" };
        break;
      }
      case "getDailyInventory": {
        const date = payload.date || new Date().toISOString().slice(0, 10);
        const [impRes, logRes] = await Promise.all([
          supabase.from("milk_imports").select("quantity").eq("date", date),
          supabase.from("daily_logs").select("qty, delivered").eq("date", date),
        ]);
        must(impRes.error); must(logRes.error);
        const totalImported = (impRes.data || []).reduce((s, i) => s + toNum(i.quantity), 0);
        const totalDelivered = (logRes.data || []).filter((l) => l.delivered).reduce((s, l) => s + toNum(l.qty), 0);
        result.data = { date, totalImported, totalDelivered, remaining: totalImported - totalDelivered };
        break;
      }
      case "rotatePIN": {
        const { currentPin, newPin } = payload;
        if (!newPin || String(newPin).trim().length < 4) throw new Error("A valid new PIN is required");
        const { data: setting, error: getErr } = await supabase.from("settings").select("value").eq("key", "PIN").single();
        must(getErr);
        if (currentPin !== undefined && String(setting.value).trim() !== String(currentPin).trim()) {
          const e = new Error("Current PIN is incorrect"); e.code = "UNAUTHORIZED"; throw e;
        }
        const { error: updErr } = await supabase.from("settings").update({ value: String(newPin).trim() }).eq("key", "PIN");
        must(updErr);
        result.data = { rotated: true };
        break;
      }
      case "eraseAllData": {
        if (payload.confirm !== "ERASE") {
          const e = new Error('Refusing to erase data without payload.confirm === "ERASE".');
          e.code = "CONFIRMATION_REQUIRED";
          throw e;
        }
        const tables = ["daily_logs", "adjustments", "credit_notes", "bills", "pause_periods", "subscriptions", "milk_imports", "milk_brands", "customers"];
        for (const t of tables) {
          const { error } = await supabase.from(t).delete().not("id", "is", null);
          must(error);
        }
        result.data = { erased: true, tables };
        break;
      }

      default:
        console.warn(`Action '${action}' not yet implemented in Supabase API`);
        throw new Error(`Unknown action: ${action}`);
    }

    return result.data;
  } catch (err) {
    console.error(`[Supabase API Error] ${action}:`, err?.message || err);
    if (isAuthError(err)) {
      window.dispatchEvent(new CustomEvent("auth:expired"));
    }
    throw err instanceof Error ? err : new Error(err?.message || String(err));
  }
}