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

export const getDaysAgoIST = (days) => {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return date.toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
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
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  // Strict UUID v4 fallback
  // cspell:disable-next-line
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
};