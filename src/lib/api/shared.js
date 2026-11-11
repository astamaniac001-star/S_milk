// lib/api/shared.js — internal helpers for the api/* domain dispatch files.
//
// Not part of the public surface (no `export` here is used outside api/*).
// The public `lib/api.js` barrel re-exports mappers and callApi; consumers
// should never import directly from this file.

import { supabase } from "../supabaseClient.js";
// (audit 2026-11-09: generateKey dropped from this import + the bottom
// re-export — its only consumer was the removed mapPaymentToApi fallback;
// the canonical source is lib/utils.js.)
import { getToday, getDaysAgoIST, fmt, toNum } from "../utils.js";

// JSONB array columns accept either an array, a JSON string, or a comma-
// joined string. Normalize to a JS array (rule §6).
export const toArray = (val) => {
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

// Day-of-week index for a YYYY-MM-DD date in Asia/Kolkata timezone.
// `new Date('YYYY-MM-DD').getDay()` uses the system TZ, wrong outside IST.
// Format with Intl and map to 0..6 (Sun..Sat).
const KOLKATA_DOW = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
export function dayOfWeekKolkata(date) {
  const name = new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    timeZone: "Asia/Kolkata",
  }).format(new Date(`${date}T12:00:00Z`));
  return KOLKATA_DOW[name] ?? 0;
}

const AUTH_ERROR_CODES = new Set(["42501", "PGRST301", "PGRST302"]);
const JWT_EXPIRED_RE = /jwt expired|jwt has expired/i;
export function isAuthError(err) {
  if (!err) return false;
  if (AUTH_ERROR_CODES.has(err.code)) return true;
  const msg = err.message || "";
  return JWT_EXPIRED_RE.test(msg);
}

// OCC update: compare-and-set on `version`. Throws code=CONFLICT when
// PGRST116 (no row matched) surfaces from .single() after no update.
export async function updateWithVersion(table, id, expectedVersion, patch) {
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

export function must(error) {
  if (error) throw error;
}

// Reused error subclass — handlers can check `err instanceof AuthzError` to
// distinguish authorization failures from business-rule failures.
export class AuthzError extends Error {
  constructor(message) {
    super(message);
    this.name = "AuthzError";
    this.code = "AUTHZ";
  }
}

export { supabase, getToday, getDaysAgoIST, fmt, toNum };
