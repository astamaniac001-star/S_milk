// public/apply-dark-mode.js
//
// FIX (audit 2026-07-25, FOUC): blocking classic script loaded from
// index.html BEFORE the React bundle. Applies the operator's theme to
// <html> so the first paint matches the app.
//
// Redesign (2026-11): an explicit stored preference always wins; with no
// stored preference the OS color scheme decides (mirrors AppShell.jsx).
// AppShell remains the source of truth for toggles; this file only reflects
// state early. Served from Vite's `public/` directory so it is delivered
// as-is to `/apply-dark-mode.js` and satisfies the `script-src 'self'`
// directive in the Content-Security-Policy meta tag.
//
// This file MUST remain a classic (non-module) script. Module scripts are
// deferred and would run AFTER first paint, defeating the purpose.
(function () {
  try {
    if (typeof localStorage === "undefined") return;
    var stored = localStorage.getItem("darkMode");
    var dark;
    if (stored === "true" || stored === "false") {
      dark = stored === "true";
    } else {
      dark =
        typeof window.matchMedia === "function" &&
        window.matchMedia("(prefers-color-scheme: dark)").matches;
    }
    if (dark) {
      document.documentElement.classList.add("dark");
    }
    // Keep the browser/PWA chrome in step before the app boots. AppShell
    // re-applies this on every explicit toggle.
    var meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute("content", dark ? "#111311" : "#f4f4f0");
  } catch {
    // localStorage/matchMedia unavailable (private mode, disabled cookies,
    // WebView restrictions) — no-op. We deliberately do NOT log here: this
    // is a parse-time critical-path script and console noise on the login
    // screen hurts more than it helps.
  }
})();
