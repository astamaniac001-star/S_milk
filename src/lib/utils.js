// ── src/lib/utils.js ─────────────────────────────────────────────────────────
// Pure helpers — no React, no DOM. Safe to import anywhere.

import { DAYS } from "./constants.js";

export const toNum = (val) => {
  if (val === null || val === undefined || val === "") return 0;
  const n = Number(val);
  return isNaN(n) ? 0 : n;
};

export const fmt = (n) => {
  const num = toNum(n);
  if (n === undefined || n === null || isNaN(num)) return "₹0.00";
  return (
    "₹" +
    num.toLocaleString("en-IN", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })
  );
};

export const getToday = () =>
  new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });

// FIX (audit 2026-07-27): the previous version did `setDate(getDate()-n)` in
// the system timezone then formatted the result in Asia/Kolkata. When the
// device TZ is west of IST, the two TZs land on different calendar dates
// around the IST midnight boundary, so the resulting "n days ago" was
// frequently one day off. The new formulation is TZ-invariant:
//   1. Resolve today's IST date string (YYYY-MM-DD).
//   2. Build a UTC Date anchored on that calendar date at noon UTC (noon is
//      safe from any ±12h device-TZ skew when this code later interprets
//      the Date for arithmetic or formatting).
//   3. Subtract n*86400000 ms — full days, no DST jumps (Asia/Kolkata has
//      no DST and neither does UTC).
//   4. Format the resulting UTC Date as an IST date string.
// Step 4 must run in Asia/Kolkata so that the calendar boundary (not the
// UTC boundary) determines the displayed day.
export const getDaysAgoIST = (days) => {
  // IST anchor: noon UTC on today's IST date. `getToday()` already returns
  // the IST date string, so constructing `YYYY-MM-DDT12:00:00Z` lands in the
  // middle of the IST day for every device timezone.
  const istToday = getToday();
  const anchor = new Date(`${istToday}T12:00:00Z`);
  const shifted = new Date(anchor.getTime() - days * 86_400_000);
  return shifted.toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
};

export const cleanPhone = (p) => String(p || "").replace(/\D/g, "");

// Human-readable delivery-day labels for a subscription's delivery_days
// array ([0..6] = Sun..Sat). Shared by the Customers and Subscriptions pages
// so both render the same schedule string.
export const dayLabels = (deliveryDays) =>
  (Array.isArray(deliveryDays) ? deliveryDays : [])
    .slice()
    .sort((a, b) => a - b)
    .map((d) => DAYS[d] || d)
    .join(", ") || "No days set";

export const matchBrandByMilkType = (log, brands) => {
  const milkType = log.product || "Milk";
  const matchedBrand = (brands || []).find(
    (b) => b.defaultMilkType && b.defaultMilkType === milkType,
  );
  return matchedBrand?.name || "Unknown brand";
};

// Brand name for a log/subscription carrying brandId — resolves directly by
// id (the brand-aware identity) and falls back to the milk-type heuristic
// for legacy/unbranded rows. Shared by Delivery/Subscriptions/Customers.
export const brandLabel = (record, brands) => {
  if (record?.brandId) {
    return (
      (brands || []).find((b) => b.id === record.brandId)?.name ||
      "Unknown brand"
    );
  }
  if (record?.product) return matchBrandByMilkType(record, brands);
  return "Unknown brand";
};

export const generateKey = () => {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  // Strict UUID v4 fallback
  // cspell:disable-next-line
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, function (c) {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
};
