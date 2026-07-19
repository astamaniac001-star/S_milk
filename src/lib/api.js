import { supabase } from "./supabaseClient.js";
import { getToday, getDaysAgoIST, fmt, toNum } from "./utils.js";

const toArray = (val) => {
  if (Array.isArray(val)) return val;
  if (typeof val === "string" && val.trim() !== "") {
    try {
      const parsed = JSON.parse(val);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return val.includes(",")
        ? val
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean)
        : [];
    }
  }
  return [];
};

const generateKey = () =>
  `${Date.now()}-${Math.random().toString(36).substring(2, 10)}`;

// Day-of-week index for a YYYY-MM-DD date in Asia/Kolkata timezone.
// `new Date('2025-07-15').getDay()` uses the system TZ, which is wrong if the
// operator is anywhere other than IST. Format with Intl and map to 0..6 (Sun..Sat).
const KOLKATA_DOW = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
function dayOfWeekKolkata(date) {
  const name = new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    timeZone: "Asia/Kolkata",
  }).format(new Date(`${date}T12:00:00Z`));
  return KOLKATA_DOW[name] ?? 0;
}

function nextMonthStart(month) {
  const [y, m] = String(month).split("-").map(Number);
  const ny = m === 12 ? y + 1 : y;
  const nm = m === 12 ? 1 : m + 1;
  return `${ny}-${String(nm).padStart(2, "0")}-01`;
}

const AUTH_ERROR_CODES = new Set(["42501", "PGRST301", "PGRST302"]);
function isAuthError(err) {
  return (
    !!err && (AUTH_ERROR_CODES.has(err.code) || /jwt/i.test(err.message || ""))
  );
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
      const conflict = new Error(
        "This record was changed elsewhere. Please refresh and try again.",
      );
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
    id: c.id,
    name: c.name,
    address: c.delivery_address,
    phone: c.phone,
    status: c.status,
    product: c.product,
    qty: toNum(c.daily_qty),
    deliveryDays: toArray(c.delivery_days),
    balance: toNum(c.balance || 0),
    version: toNum(c.version || 1),
  };
}

export function mapBillFromApi(b) {
  return {
    id: b.id,
    custId: b.customer_id,
    month: b.month,
    amount: toNum(b.amount),
    paid: toNum(b.amount_paid),
    status: b.status,
    locked: !!b.locked,
    due: b.due_date,
    version: toNum(b.version || 1),
  };
}
export function mapImportFromApi(i) {
  return {
    id: i.id,
    brand: i.brand_name,
    type: i.milk_type,
    qty: toNum(i.quantity),
    rate: toNum(i.rate_per_liter),
    total: toNum(i.total_cost),
    invoice: i.invoice_number,
    supplier: i.supplier_name,
    date: i.date,
    status: i.status,
    version: toNum(i.version || 1),
  };
}
export function mapLogFromApi(l) {
  return {
    id: l.id,
    custId: l.customer_id,
    date: l.date,
    delivered: !!l.delivered,
    qty: toNum(l.qty),
    product: l.product,
    note: l.note,
  };
}
export function mapAdjustmentFromApi(a) {
  return {
    adjustmentId: a.id,
    billId: a.bill_id,
    customerId: a.customer_id,
    amount: toNum(a.amount),
    reason: a.reason,
    applied: !!a.applied,
    date: a.date,
  };
}
export function mapPauseFromApi(p) {
  return {
    id: p.id,
    custId: p.customer_id,
    start: p.start_date,
    end: p.end_date,
    reason: p.reason,
  };
}
export function mapBrandFromApi(b) {
  return {
    id: b.id,
    name: b.brand_name,
    status: b.status,
    supplier: b.supplier_name,
    phone: b.supplier_phone,
    defaultMilkType: b.default_milk_type,
    rate: toNum(b.rate_per_liter),
  };
}
export function mapSubscriptionFromApi(s) {
  return {
    id: s.id,
    customerId: s.customer_id,
    milkType: s.milk_type,
    qty: toNum(s.qty),
    deliveryDays: toArray(s.delivery_days),
    isActive: !!s.is_active,
    version: toNum(s.version || 1),
  };
}
export function mapCreditNoteFromApi(c) {
  return {
    id: c.id,
    customerId: c.customer_id,
    billId: c.bill_id,
    amount: toNum(c.amount),
    reason: c.reason,
    applied: !!c.applied,
    date: c.date,
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
  };
}
export function mapImportToApi(form) {
  const out = {
    brandName: form.brand,
    milkType: form.type,
    quantity: Number(form.qty),
    ratePerLiter: Number(form.rate),
    totalCost: Number(form.total),
    invoiceNumber: form.invoice,
    supplierName: form.supplier,
    date: form.date,
  };
  if (form.id) {
    out.id = form.id;
    out.expectedVersion = form.version;
  } else {
    out.idempotencyKey = generateKey();
  }
  return out;
}
export function mapPaymentToApi(billId, amount, opts = {}) {
  return {
    billId,
    amount: Number(amount),
    mode: opts.mode || "Cash",
    date: opts.date,
    note: opts.note,
    idempotencyKey: generateKey(),
  };
}

export async function verifyPIN(pin) {
  const { data, error } = await supabase
    .from("settings")
    .select("value")
    .eq("key", "PIN")
    .single();
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

// fallow-ignore-next-line complexity
export async function callApi(action, payload = {}) {
  const result = { data: {} };
  try {
    switch (action) {
      case "verifyPIN": {
        const { pin } = payload;
        if (!pin || String(pin).length !== 6) {
          const e = new Error("PIN must be exactly 6 digits.");
          e.code = "INVALID_FORMAT";
          throw e;
        }
        // CRITICAL FIX: Call the secure Postgres RPC instead of reading plaintext settings
        const { data, error } = await supabase.rpc("verify_pin", { input_pin: pin });
        if (error || !data?.success) {
          const e = new Error(
            data?.message || "Invalid PIN or account temporarily locked.",
          );
          e.code = "AUTH_FAILED";
          throw e;
        }
        // The secure RPC returns { success: true, token: "uuid..." }
        result.data = { token: data.token };
        break;
      }

      case "getCustomers": {
        const { data, error } = await supabase
          .from("customers")
          .select("*")
          .order("name");
        must(error);
        result.data = { customers: data || [] };
        break;
      }
      case "addCustomer": {
        const { data, error } = await supabase
          .from("customers")
          .insert([
            {
              name: payload.name,
              phone: payload.phone,
              delivery_address: payload.deliveryAddress,
              product: payload.product,
              daily_qty: toNum(payload.dailyQty),
              delivery_days: JSON.stringify(
                payload.deliveryDays || [0, 1, 2, 3, 4, 5, 6],
              ),
            },
          ])
          .select()
          .single();
        must(error);
        result.data = { customerId: data.id };
        break;
      }
      case "updateCustomer": {
        const data = await updateWithVersion(
          "customers",
          payload.customerId,
          payload.expectedVersion ?? payload.version,
          {
            name: payload.name,
            delivery_address: payload.deliveryAddress,
            phone: payload.phone,
            product: payload.product,
            daily_qty: toNum(payload.dailyQty),
            delivery_days: JSON.stringify(payload.deliveryDays),
            status: payload.status,
          },
        );
        result.data = { customerId: data.id, newVersion: data.version };
        break;
      }

      case "deactivateCustomer": {
        const { error } = await supabase
          .from("customers")
          .update({ status: "Inactive" })
          .eq("id", payload.customerId);
        must(error);
        break;
      }

      case "rolloverMonth": {
        const { targetMonth } = payload; // e.g., "2024-08"
        if (!targetMonth) throw new Error("targetMonth is required");

        // 1. Fetch ONLY active subscriptions (manually cancelled ones are safely ignored)
        const { data: subs, error: subErr } = await supabase
          .from("subscriptions")
          .select("id, customer_id, end_date")
          .eq("is_active", true);
        must(subErr);

        const results = { renewed: 0, billsGenerated: 0, errors: [] };
        const [y, m] = targetMonth.split("-").map(Number);

        // Calculate the last day of the target month (e.g., "2024-08-31")
        const lastDayOfMonth = new Date(y, m, 0).toISOString().split("T")[0];
        const nextMonthBoundary = nextMonthStart(targetMonth);
        console.warn(`[Rollover] Processing ${targetMonth}. Next month starts: ${nextMonthBoundary}`);

        for (const sub of subs) {
          try {
            // 2. Extend subscription end_date if it's in the past or ends before the new month
            const currentEnd = sub.end_date;
            if (!currentEnd || currentEnd < lastDayOfMonth) {
              await supabase
                .from("subscriptions")
                .update({ end_date: lastDayOfMonth })
                .eq("id", sub.id);
              results.renewed++;
            }

            // 3. Check if a bill already exists for this customer & target month
            const { data: existingBill } = await supabase
              .from("bills")
              .select("id")
              .eq("customer_id", sub.customer_id)
              .eq("month", targetMonth)
              .maybeSingle();

            // 4. If no bill exists, generate one (Amount defaults to 0, admin can adjust or it populates from logs)
            if (!existingBill) {
              await supabase.from("bills").insert({
                customer_id: sub.customer_id,
                month: targetMonth,
                amount: 0, // Set to 0; admin can adjust, or it can be calculated from daily logs later
                amount_paid: 0,
                status: "Unpaid",
                locked: false,
                version: 1,
              });
              results.billsGenerated++;
            }
          } catch (err) {
            results.errors.push({
              customerId: sub.customer_id,
              error: err.message,
            });
          }
        }

        result.data = results;
        break;
      }

      case "getDailyLogs": {
        let q = supabase.from("daily_logs").select("*");

        if (payload.date) {
          // Specific day requested (e.g., viewing a single day's delivery)
          q = q.eq("date", payload.date);
        } else {
          // CRITICAL FIX: Default to the last 30 days to prevent unbounded data fetches
          // This uses the getDaysAgoIST helper we added to utils.js
          const endDate = getToday();
          const startDate = getDaysAgoIST(30);
          q = q.gte("date", startDate).lte("date", endDate);
        }

        const { data, error } = await q.order("date", { ascending: false });
        must(error);
        result.data = { logs: data || [] };
        break;
      }
      case "updateLogEntry": {
        const { error } = await supabase
          .from("daily_logs")
          .update({
            delivered: payload.delivered,
            qty: toNum(payload.qty),
            note: payload.note,
          })
          .eq("id", payload.logId);
        must(error);
        break;
      }
      case "bulkUpsertLogs": {
        // FIX: guard against undefined / non-array / empty input.
        if (!Array.isArray(payload.logs) || payload.logs.length === 0) {
          result.data = { saved: 0 };
          break;
        }
        const rows = payload.logs.map((l) => ({
          customer_id: l.customerId,
          date: l.date,
          product: l.product || "Full Cream",
          qty: toNum(l.qty),
          delivered: !!l.delivered,
          note: l.note || "",
        }));
        const { error } = await supabase
          .from("daily_logs")
          .upsert(rows, { onConflict: "customer_id,date" });
        must(error);
        result.data = { saved: rows.length };
        break;
      }
      case "generateDailyLogsForDate": {
        const { date } = payload;
        if (!date) throw new Error("date is required");

        // FIX: use Asia/Kolkata weekday, not the system-local weekday.
        const dow = dayOfWeekKolkata(date);

        // CRITICAL FIX: Added delivery_days, daily_qty, product to customer select
        // to enable fallback when no subscription exists.
        const [custRes, subRes, pauseRes, logRes] = await Promise.all([
          supabase
            .from("customers")
            .select("id, status, delivery_days, daily_qty, product"),
          supabase
            .from("subscriptions")
            .select("customer_id, delivery_days, qty, milk_type")
            .eq("is_active", true),
          supabase
            .from("pause_periods")
            .select("customer_id, start_date, end_date"),
          supabase.from("daily_logs").select("customer_id").eq("date", date),
        ]);
        must(custRes.error);
        must(subRes.error);
        must(pauseRes.error);
        must(logRes.error);

        const existing = new Set((logRes.data || []).map((l) => l.customer_id));
        const subsByCustomer = new Map();
        for (const s of subRes.data || []) {
          if (!subsByCustomer.has(s.customer_id))
            subsByCustomer.set(s.customer_id, []);
          subsByCustomer.get(s.customer_id).push(s);
        }
        const paused = new Set(
          (pauseRes.data || [])
            .filter(
              (p) =>
                p.start_date <= date && (!p.end_date || p.end_date >= date),
            )
            .map((p) => p.customer_id),
        );

        let created = 0,
          skippedExisting = 0,
          skippedPaused = 0,
          skippedWrongDay = 0,
          skippedInactiveCust = 0;
        const toInsert = [];

        for (const c of custRes.data || []) {
          if (existing.has(c.id)) {
            skippedExisting++;
            continue;
          }
          if (c.status !== "Active") {
            skippedInactiveCust++;
            continue;
          }

          // 1. Try to find an active subscription matching this day of week
          const subMatch = (subsByCustomer.get(c.id) || []).find((s) =>
            toArray(s.delivery_days).map(Number).includes(dow),
          );

          // 2. CRITICAL FIX: Fallback to customer defaults if no subscription exists for this day
          const custMatch =
            !subMatch && toArray(c.delivery_days).map(Number).includes(dow)
              ? c
              : null;

          // If neither subscription nor customer default schedules delivery for this day, skip
          if (!subMatch && !custMatch) {
            skippedWrongDay++;
            continue;
          }

          if (paused.has(c.id)) {
            skippedPaused++;
            continue;
          }

          // Use subscription data if available, otherwise fall back to customer data
          const source = subMatch || custMatch;

          toInsert.push({
            customer_id: c.id,
            date,
            product: source.milk_type || source.product || "Full Cream",
            qty: toNum(source.qty || source.daily_qty || 1),
            delivered: false, // Note: Changed from 'true' to 'false' as auto-generated logs should start pending. Revert to 'true' if your business logic requires it.
            note: subMatch
              ? "Auto-generated (Sub)"
              : "Auto-generated (Customer Default)",
          });
        }

        if (toInsert.length) {
          // CRITICAL FIX: Changed from .insert() to .upsert() with onConflict.
          // This leverages the UNIQUE(customer_id, date) constraint we added earlier,
          // making this operation idempotent and safe from race conditions.
          const { error } = await supabase
            .from("daily_logs")
            .upsert(toInsert, { onConflict: "customer_id,date" });
          must(error);
          created = toInsert.length;
        }
        result.data = {
          created,
          skippedExisting,
          skippedPaused,
          skippedWrongDay,
          skippedInactiveCust,
        };
        break;
      }
      case "addAdHocLog": {
        const { customerId, date, qty, reason, product } = payload;
        if (!customerId || !date)
          throw new Error("customerId and date are required");
        const addQty = toNum(qty);
        const note = reason ? `Extra: ${reason}` : "Extra delivery";

        const { data: existingLog, error: selErr } = await supabase
          .from("daily_logs")
          .select("*")
          .eq("customer_id", customerId)
          .eq("date", date)
          .maybeSingle();
        must(selErr);

        if (existingLog) {
          const { data, error } = await supabase
            .from("daily_logs")
            .update({
              qty: toNum(existingLog.qty) + addQty,
              delivered: true,
              note: existingLog.note ? `${existingLog.note} | ${note}` : note,
            })
            .eq("id", existingLog.id)
            .select()
            .single();
          must(error);
          result.data = { logId: data.id, qty: data.qty };
        } else {
          const { data, error } = await supabase
            .from("daily_logs")
            .insert([
              {
                customer_id: customerId,
                date,
                product: product || "Full Cream",
                qty: addQty,
                delivered: true,
                note,
              },
            ])
            .select()
            .single();
          must(error);
          result.data = { logId: data.id, qty: data.qty };
        }
        break;
      }

      case "getBills": {
        let q = supabase.from("bills").select("*");

        // CRITICAL FIX: Default to the current month to prevent fetching years of historical data.
        // getToday().slice(0, 7) reliably returns "YYYY-MM" in IST (e.g., "2024-07").
        const targetMonth = payload.month || getToday().slice(0, 7);

        q = q.eq("month", targetMonth); // Assumes your DB column is named 'month'

        const { data, error } = await q.order("month", { ascending: false });
        must(error);
        result.data = { bills: data || [] };
        break;
      }
      case "lockBill": {
        const { error } = await supabase
          .from("bills")
          .update({ locked: true })
          .eq("id", payload.billId);
        must(error);
        break;
      }
      case "unlockBill": {
        const { error } = await supabase
          .from("bills")
          .update({ locked: false })
          .eq("id", payload.billId);
        must(error);
        break;
      }
      case "recordPayment": {
        const {
          billId,
          amount,
          paymentMode,
          paymentDate,
          note,
          idempotencyKey,
        } = payload;
        if (!billId || !(toNum(amount) > 0))
          throw new Error("A valid billId and amount are required");

        const { data: bill, error: billErr } = await supabase
          .from("bills")
          .select("*")
          .eq("id", billId)
          .single();
        must(billErr);

        if (bill.locked) {
          const e = new Error("This bill is locked.");
          e.code = "LOCKED";
          throw e;
        }

        const pending = toNum(bill.amount) - toNum(bill.amount_paid);
        if (toNum(amount) > pending + 0.01) {
          const e = new Error(
            `Payment ${fmt(toNum(amount))} exceeds pending ${fmt(pending)}. Use a credit note for advance payment.`,
          );
          e.code = "OVERPAY";
          throw e;
        }

        const newPaid = toNum(bill.amount_paid) + toNum(amount);
        const status =
          newPaid >= toNum(bill.amount)
            ? "Paid"
            : newPaid > 0
              ? "Partial"
              : "Unpaid";
        const currentVersion = toNum(bill.version);

        // 1. Update the bill (Optimistic Concurrency)
        const { data: updatedBill, error: updateErr } = await supabase
          .from("bills")
          .update({
            amount_paid: newPaid,
            status,
            version: currentVersion + 1,
            updated_at: new Date().toISOString(),
          })
          .eq("id", billId)
          .eq("version", currentVersion)
          .select()
          .single();

        if (updateErr) {
          if (updateErr.code === "PGRST116") {
            const e = new Error(
              "CONFLICT: This bill was modified by another tab. Please refresh.",
            );
            e.code = "CONFLICT";
            throw e;
          }
          must(updateErr);
        }

        // 2. CRITICAL FIX: Record the payment metadata in the new 'payments' table
        if (idempotencyKey) {
          const { error: paymentErr } = await supabase.from("payments").insert({
            bill_id: billId,
            customer_id: bill.customer_id, // Assumes bill has customer_id
            amount: toNum(amount),
            payment_mode: paymentMode || "Unknown",
            payment_date: paymentDate || getToday(),
            note: note || "",
            idempotency_key: idempotencyKey,
          });

          // If it's a duplicate key, it means a retry happened. We can safely ignore the insert error
          // because the bill was already updated in step 1, but we should log it.
          if (paymentErr && paymentErr.code !== "23505") {
            // 23505 is unique_violation
            console.error("Failed to record payment metadata:", paymentErr);
          }
        }

        result.data = {
          billId: updatedBill.id,
          amountPaid: updatedBill.amount_paid,
          status: updatedBill.status,
        };
        break;
      }

      case "generateMonthBill": {
        const { customerId, month, amount } = payload;
        if (!customerId || !month)
          throw new Error("customerId and month are required");

        // 1. Check if bill already exists for this customer/month
        const { data: existingBill, error: fetchErr } = await supabase
          .from("bills")
          .select("*")
          .eq("customer_id", customerId)
          .eq("month", month)
          .maybeSingle();

        must(fetchErr);

        if (existingBill) {
          if (existingBill.locked) {
            const e = new Error("Cannot regenerate a locked bill.");
            e.code = "LOCKED";
            throw e;
          }

          const currentVersion = toNum(existingBill.version);

          // 2. CRITICAL FIX: True CAS update with version check
          const { data, error: updateErr } = await supabase
            .from("bills")
            .update({
              amount: toNum(amount),
              version: currentVersion + 1,
              updated_at: new Date().toISOString(),
            })
            .eq("id", existingBill.id)
            .eq("version", currentVersion) // <-- Prevents lost updates
            .select()
            .single();

          if (updateErr) {
            if (updateErr.code === "PGRST116") {
              const e = new Error(
                "CONFLICT: This bill was modified elsewhere. Please refresh.",
              );
              e.code = "CONFLICT";
              throw e;
            }
            must(updateErr);
          }
          result.data = { bill: mapBillFromApi(data), action: "updated" };
        } else {
          // 3. Create new bill (no version check needed for inserts)
          const { data, error: insertErr } = await supabase
            .from("bills")
            .insert({
              customer_id: customerId,
              month,
              amount: toNum(amount),
              amount_paid: 0,
              status: "Unpaid",
              locked: false,
              version: 1,
            })
            .select()
            .single();

          must(insertErr);
          result.data = { bill: mapBillFromApi(data), action: "created" };
        }
        break;
      }
      case "getBillText": {
        const { billId } = payload;
        if (!billId) throw new Error("billId is required");
        const { data: bill, error: billErr } = await supabase
          .from("bills")
          .select("*")
          .eq("id", billId)
          .single();
        must(billErr);
        const { data: cust } = await supabase
          .from("customers")
          .select("name")
          .eq("id", bill.customer_id)
          .maybeSingle();
        const pending = toNum(bill.amount) - toNum(bill.amount_paid);
        // FIX: use fmt() so ₹ + en-IN locale formatting is consistent with the UI.
        const text =
          `Hi ${cust?.name || "there"}, your milk bill for ${bill.month} is ` +
          `${fmt(toNum(bill.amount))}. Paid so far: ${fmt(toNum(bill.amount_paid))}. ` +
          (pending > 0
            ? `Pending: ${fmt(pending)}.`
            : "Fully paid — thank you!");
        result.data = { text };
        break;
      }

      case "getAdjustments": {
        const { data, error } = await supabase
          .from("adjustments")
          .select("*")
          .order("created_at", { ascending: false });
        must(error);
        result.data = { adjustments: data || [] };
        break;
      }
      case "addAdjustment": {
        const { data, error } = await supabase
          .from("adjustments")
          .insert([
            {
              customer_id: payload.customerId,
              bill_id: payload.billId,
              amount: toNum(payload.amount),
              reason: payload.reason,
              applied: false,
              date: payload.date,
            },
          ])
          .select()
          .single();
        must(error);
        result.data = { adjustmentId: data.id };
        break;
      }

      case "applyAdjustment": {
        const { adjustmentId, billId } = payload;
        if (!adjustmentId) throw new Error("adjustmentId is required");

        if (billId) {
          const { data: adj, error: adjErr } = await supabase
            .from("adjustments")
            .select("*")
            .eq("id", adjustmentId)
            .single();
          must(adjErr);

          // CRITICAL FIX: Prevent double-application if a previous attempt partially failed
          if (adj.applied) {
            const e = new Error("This adjustment has already been applied.");
            e.code = "ALREADY_APPLIED";
            throw e;
          }

          const { data: bill, error: billErr } = await supabase
            .from("bills")
            .select("*")
            .eq("id", billId)
            .single();
          must(billErr);

          if (bill.locked) {
            const e = new Error("Cannot apply an adjustment to a locked bill.");
            e.code = "LOCKED";
            throw e;
          }

          const newAmount = toNum(bill.amount) + toNum(adj.amount);
          const paid = toNum(bill.amount_paid);
          const status =
            paid >= newAmount && newAmount > 0
              ? "Paid"
              : paid > 0
                ? "Partial"
                : "Unpaid";
          const currentVersion = toNum(bill.version);

          // CRITICAL FIX: Optimistic Concurrency Control for the bill update
          const { error: updErr } = await supabase
            .from("bills")
            .update({
              amount: newAmount,
              status,
              version: currentVersion + 1,
              updated_at: new Date().toISOString(),
            })
            .eq("id", billId)
            .eq("version", currentVersion);

          if (updErr) {
            if (updErr.code === "PGRST116") {
              const e = new Error(
                "CONFLICT: This bill was modified elsewhere. Please refresh.",
              );
              e.code = "CONFLICT";
              throw e;
            }
            must(updErr);
          }
        }

        const { error } = await supabase
          .from("adjustments")
          .update({ applied: true })
          .eq("id", adjustmentId);
        must(error);
        result.data = { adjustmentId, billId: billId || null };
        break;
      }
      case "getCreditNotes": {
        const { data, error } = await supabase
          .from("credit_notes")
          .select("*")
          .order("created_at", { ascending: false });
        must(error);
        result.data = { creditNotes: data || [] };
        break;
      }
      case "addCreditNote": {
        const { data, error } = await supabase
          .from("credit_notes")
          .insert([
            {
              customer_id: payload.customerId,
              bill_id: payload.billId || null,
              amount: toNum(payload.amount),
              reason: payload.reason,
              applied: false,
              date: payload.date,
            },
          ])
          .select()
          .single();
        must(error);
        result.data = { creditNoteId: data.id };
        break;
      }

      case "getMilkImports": {
        const { data, error } = await supabase
          .from("milk_imports")
          .select("*")
          .order("date", { ascending: false });
        must(error);
        result.data = { imports: data || [] };
        break;
      }
      case "addMilkImport": {
        const { data, error } = await supabase
          .from("milk_imports")
          .insert([
            {
              brand_name: payload.brandName,
              milk_type: payload.milkType,
              quantity: toNum(payload.quantity),
              rate_per_liter: toNum(payload.ratePerLiter),
              total_cost: toNum(payload.totalCost),
              invoice_number: payload.invoiceNumber,
              supplier_name: payload.supplierName,
              date: payload.date,
            },
          ])
          .select()
          .single();
        must(error);
        result.data = { importId: data.id };
        break;
      }
      case "updateMilkImport": {
        const data = await updateWithVersion(
          "milk_imports",
          payload.id,
          payload.expectedVersion ?? payload.version,
          {
            brand_name: payload.brandName,
            milk_type: payload.milkType,
            quantity: toNum(payload.quantity),
            rate_per_liter: toNum(payload.ratePerLiter),
            total_cost: toNum(payload.totalCost),
            invoice_number: payload.invoiceNumber,
            supplier_name: payload.supplierName,
            date: payload.date,
          },
        );
        result.data = { importId: data.id, newVersion: data.version };
        break;
      }
      case "confirmMilkImport": {
        const { error } = await supabase
          .from("milk_imports")
          .update({ status: "Confirmed" })
          .eq("id", payload.importId);
        must(error);
        break;
      }
      case "deleteMilkImport": {
        const { error } = await supabase
          .from("milk_imports")
          .delete()
          .eq("id", payload.importId);
        must(error);
        break;
      }
      case "getBrands": {
        const { data, error } = await supabase
          .from("milk_brands")
          .select("*")
          .order("brand_name");
        must(error);
        result.data = { brands: data || [] };
        break;
      }
      case "addMilkBrand": {
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
        result.data = { brandId: data.id };
        break;
      }

      case "getPauses": {
        const { data, error } = await supabase
          .from("pause_periods")
          .select("*")
          .order("created_at", { ascending: false });
        must(error);
        result.data = { pauses: data || [] };
        break;
      }
      case "addPausePeriod": {
        const { error } = await supabase.from("pause_periods").insert([
          {
            customer_id: payload.customerId,
            start_date: payload.startDate,
            end_date: payload.endDate,
            reason: payload.reason,
          },
        ]);
        must(error);
        break;
      }
      case "getSubscriptions": {
        const { data, error } = await supabase
          .from("subscriptions")
          .select("*");
        must(error);
        result.data = { subscriptions: data || [] };
        break;
      }
      case "saveSubscription": {
        if (payload.id) {
          const data = await updateWithVersion(
            "subscriptions",
            payload.id,
            payload.expectedVersion ?? payload.version,
            {
              milk_type: payload.milkType,
              qty: toNum(payload.qty),
              delivery_days: JSON.stringify(payload.deliveryDays),
              is_active: payload.isActive,
            },
          );
          result.data = { subscriptionId: data.id, newVersion: data.version };
        } else {
          const { data, error } = await supabase
            .from("subscriptions")
            .insert([
              {
                customer_id: payload.customerId,
                milk_type: payload.milkType,
                qty: toNum(payload.qty),
                delivery_days: JSON.stringify(payload.deliveryDays),
                is_active:
                  payload.isActive !== undefined ? payload.isActive : true,
              },
            ])
            .select()
            .single();
          must(error);
          result.data = { subscriptionId: data.id };
        }
        break;
      }
      case "getSubscriptionHistory": {
        const { subscriptionId } = payload;
        if (!subscriptionId) throw new Error("subscriptionId is required");
        const { data: sub, error } = await supabase
          .from("subscriptions")
          .select("*")
          .eq("id", subscriptionId)
          .maybeSingle();
        must(error);
        const history = [];
        if (sub?.created_at) {
          history.push({
            id: `${sub.id}-created`,
            action: "CREATED",
            details: `${sub.milk_type || "Subscription"} · ${toNum(sub.qty)}L`,
            timestamp: sub.created_at,
          });
        }
        if (sub?.updated_at && sub.updated_at !== sub.created_at) {
          history.push({
            id: `${sub.id}-updated`,
            action: "UPDATED",
            details: `Now ${sub.milk_type || ""} · ${toNum(sub.qty)}L · v${sub.version || 1}`,
            timestamp: sub.updated_at,
          });
        }
        result.data = { history };
        break;
      }

      case "runDiagnostics": {
        const { error } = await supabase
          .from("settings")
          .select("key")
          .limit(1);
        must(error);
        result.data = { status: "OK" };
        break;
      }
      case "healthCheck": {
        const { error } = await supabase
          .from("settings")
          .select("key")
          .limit(1);
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
        // FIX: clamp to 0, expose shortage separately when deliveries exceed imports.
        result.data = {
          date,
          totalImported,
          totalDelivered,
          remaining: Math.max(0, rawRemaining),
          shortage: rawRemaining < 0 ? Math.abs(rawRemaining) : 0,
        };
        break;
      }
      case "rotatePIN": {
        const { currentPin, newPin } = payload;

        const cleanCurrent = String(currentPin || "").replace(/\D/g, "");
        const cleanNew = String(newPin || "").replace(/\D/g, "");

        if (cleanCurrent.length !== 6 || cleanNew.length !== 6) {
          throw new Error(
            "Both current and new PINs must be exactly 6 digits.",
          );
        }

        // Call the secure RPC to rotate the PIN
        const { data, error } = await supabase.rpc("rotate_pin", {
          current_pin: cleanCurrent,
          new_pin: cleanNew,
        });

        if (error || !data?.success) {
          const e = new Error(
            data?.message || "Failed to rotate PIN. Check current PIN.",
          );
          e.code = "ROTATE_FAILED";
          throw e;
        }

        result.data = { success: true };
        break;
      }
      case "eraseAllData": {
        if (payload.confirm !== "ERASE") {
          const e = new Error(
            'Refusing to erase data without payload.confirm === "ERASE".',
          );
          e.code = "CONFIRMATION_REQUIRED";
          throw e;
        }
        const tables = [
          "daily_logs",
          "adjustments",
          "credit_notes",
          "bills",
          "pause_periods",
          "subscriptions",
          "milk_imports",
          "milk_brands",
          "customers",
        ];
        for (const t of tables) {
          const { error } = await supabase
            .from(t)
            .delete()
            .not("id", "is", null);
          must(error);
        }
        result.data = { erased: true, tables };
        break;
      }
      case "applyCreditNote": {
        const { creditNoteId, billId } = payload;
        if (!creditNoteId || !billId)
          throw new Error("creditNoteId and billId are required");

        // 1. Fetch the credit note
        const { data: cn, error: cnErr } = await supabase
          .from("credit_notes")
          .select("*")
          .eq("id", creditNoteId)
          .single();
        must(cnErr);

        if (cn.applied) {
          const e = new Error("This credit note has already been applied.");
          e.code = "ALREADY_APPLIED";
          throw e;
        }

        // 2. Fetch the bill
        const { data: bill, error: billErr } = await supabase
          .from("bills")
          .select("*")
          .eq("id", billId)
          .single();
        must(billErr);

        if (bill.locked) {
          const e = new Error("Cannot apply a credit note to a locked bill.");
          e.code = "LOCKED";
          throw e;
        }

        // 3. Apply the credit note to the bill's amount_paid
        const newPaid = toNum(bill.amount_paid) + toNum(cn.amount);
        const status =
          newPaid >= toNum(bill.amount)
            ? "Paid"
            : newPaid > 0
              ? "Partial"
              : "Unpaid";
        const currentVersion = toNum(bill.version);

        const { error: billUpdateErr } = await supabase
          .from("bills")
          .update({
            amount_paid: newPaid,
            status,
            version: currentVersion + 1,
            updated_at: new Date().toISOString(),
          })
          .eq("id", billId)
          .eq("version", currentVersion);

        if (billUpdateErr) {
          if (billUpdateErr.code === "PGRST116") {
            const e = new Error(
              "CONFLICT: This bill was modified elsewhere. Please refresh.",
            );
            e.code = "CONFLICT";
            throw e;
          }
          must(billUpdateErr);
        }
        // 4. Mark the credit note as applied
        const { error: cnUpdateErr } = await supabase
          .from("credit_notes")
          .update({
            applied: true,
            applied_to_bill_id: billId,
            updated_at: new Date().toISOString(),
          })
          .eq("id", creditNoteId);
        must(cnUpdateErr);

        result.data = { creditNoteId, billId, newPaid, status };
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
