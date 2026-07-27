// ── src/lib/utils.js ─────────────────────────────────────────────────────────
// Pure helpers — no React, no DOM. Safe to import anywhere.

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

let _uuidCounter = 0;
export const uuid = () => {
  _uuidCounter += 1;
  return (
    Date.now().toString(36).toUpperCase().slice(-4) +
    "-" +
    _uuidCounter.toString(36).toUpperCase().padStart(4, "0")
  );
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
