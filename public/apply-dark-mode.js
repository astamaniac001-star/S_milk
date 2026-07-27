// public/apply-dark-mode.js
//
// FIX (audit 2026-07-25, FOUC): blocking classic script loaded from
// index.html BEFORE the React bundle. Applies the user's saved dark-mode
// preference to <html> so the first paint is dark when dark mode is enabled.
// AppShell.jsx remains the source of truth for toggles; this file only
// reflects localStorage state early. Served from Vite's `public/` directory
// so it is delivered as-is to `/apply-dark-mode.js` and satisfies the
// `script-src 'self'` directive in the Content-Security-Policy meta tag.
//
// This file MUST remain a classic (non-module) script. Module scripts are
// deferred and would run AFTER first paint, defeating the purpose.
(function () {
  try {
    if (
      typeof localStorage !== "undefined" &&
      localStorage.getItem("darkMode") === "true"
    ) {
      var root = document.documentElement;
      root.classList.add("dark");
    }
  } catch {
    // localStorage unavailable (private mode, disabled cookies, etc.) — no-op.
    // We deliberately do NOT log here: this is a parse-time critical-path
    // script and Any I/O channel would be wasted budget.
  }
})();
