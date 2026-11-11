// lib/api.js — thin barrel + dispatcher.
//
// All consumers import from "../lib/api.js" unchanged. The actual per-action
// implementations live under "./api/<domain>.js"; mappers live in
// "./api/mappers.js"; shared helpers live in "./api/shared.js". This file
// only re-exports the public surface and dispatches `callApi(action, payload)`
// to the right domain function (rule §1: all data ops go through callApi).

import {
  mapCustomerFromApi,
  mapImportFromApi,
  mapLogFromApi,
  mapAdjustmentFromApi,
  mapPauseFromApi,
  mapBrandFromApi,
  mapBrandToApi,
  mapSubscriptionFromApi,
  mapCreditNoteFromApi,
  mapCustomerToApi,
  mapImportToApi,
  mapPaymentToApi,
  mapSubscriptionToApi,
} from "./api/mappers.js";
import { isAuthError } from "./api/shared.js";

import {
  getCustomers,
  addCustomer,
  updateCustomer,
  deactivateCustomer,
} from "./api/customers.js";
import {
  rolloverMonth,
  getSubscriptions,
  saveSubscription,
  deleteSubscription,
  getSubscriptionHistory,
} from "./api/subscriptions.js";
import {
  getDailyLogs,
  updateLogEntry,
  bulkUpsertLogs,
  generateDailyLogsForDate,
  addAdHocLog,
} from "./api/delivery.js";
import {
  getBills,
  lockBill,
  unlockBill,
  recordPayment,
  generateMonthBill,
  getBillText,
} from "./api/billing.js";
import {
  getAdjustments,
  addAdjustment,
  applyAdjustment,
  getCreditNotes,
  addCreditNote,
  applyCreditNote,
} from "./api/adjustments.js";
import {
  getMilkImports,
  addMilkImport,
  updateMilkImport,
  confirmMilkImport,
  deleteMilkImport,
  getBrands,
  saveBrand,
  getDailyInventory,
} from "./api/imports.js";
import {
  getPauses,
  addPausePeriod,
  runDiagnostics,
  healthCheck,
  rotatePIN,
} from "./api/admin.js";

// Re-export the public mappers and the auth-error helper so existing imports
// (`import { callApi } from "../lib/api.js"`) keep working. mappers.js stays
// the canonical source — api/* domain files import from it directly.
// (mapBillFromApi is deliberately NOT re-exported: it had no consumers via
// this barrel — audit 2026-11-09 dead-export cleanup.)
export {
  mapCustomerFromApi,
  mapImportFromApi,
  mapLogFromApi,
  mapAdjustmentFromApi,
  mapPauseFromApi,
  mapBrandFromApi,
  mapBrandToApi,
  mapSubscriptionFromApi,
  mapCreditNoteFromApi,
  mapCustomerToApi,
  mapImportToApi,
  mapPaymentToApi,
  mapSubscriptionToApi,
};

// Per-action dispatch table. Keeping this as a plain object (instead of a
// `switch`) makes the file small enough to scan at a glance — the actual
// complexity lives in the domain files. `undefined` entries throw Unknown
// action so silent success is impossible (rule §1).
const DISPATCH = {
  // Customers
  getCustomers,
  addCustomer,
  updateCustomer,
  deactivateCustomer,

  // Subscriptions / rollover
  // NOTE: rolloverMonth is registered but intentionally not wired up — future feature
  rolloverMonth,
  getSubscriptions,
  saveSubscription,
  deleteSubscription,
  getSubscriptionHistory,

  // Daily logs
  getDailyLogs,
  updateLogEntry,
  bulkUpsertLogs,
  generateDailyLogsForDate,
  addAdHocLog,

  // Billing
  getBills,
  lockBill,
  unlockBill,
  recordPayment,
  generateMonthBill,
  getBillText,

  // Adjustments / credit notes
  getAdjustments,
  addAdjustment,
  applyAdjustment,
  getCreditNotes,
  addCreditNote,
  applyCreditNote,

  // Imports / brands / inventory
  getMilkImports,
  addMilkImport,
  updateMilkImport,
  confirmMilkImport,
  deleteMilkImport,
  getBrands,
  // saveBrand: atomic brand + per-type rates via save_brand_rpc (replaces
  // the old addMilkBrand plain insert).
  saveBrand,
  // getDailyInventory powers the Imports page "By day" stock card
  // (wired 2026-11-10; Confirmed-only import counting).
  getDailyInventory,

  // Admin
  getPauses,
  addPausePeriod,
  runDiagnostics,
  healthCheck,
  rotatePIN,
};

// fallow-ignore-next-line complexity
export async function callApi(action, payload = {}) {
  try {
    const handler = DISPATCH[action];
    if (!handler) {
      console.warn(`Action '${action}' not yet implemented in Supabase API`);
      throw new Error(`Unknown action: ${action}`);
    }
    return await handler(payload);
  } catch (err) {
    console.error(`[Supabase API Error] ${action}:`, err?.message || err);
    if (isAuthError(err)) {
      window.dispatchEvent(new CustomEvent("auth:expired"));
    }
    throw err instanceof Error ? err : new Error(err?.message || String(err));
  }
}
