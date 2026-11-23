// FIX (2026-11-21 audit — AI-S M6): the SW used to register on localhost,
// so `npm run dev` on :5173 installed the cache-first shell and pinned it —
// shell edits appeared stale until the CACHE name was bumped, and Playwright
// webServer runs hit the same trap. Register only in real production
// origins (https non-local); `vite preview` / deployed hosts keep the PWA.
(function () {
  if (!("serviceWorker" in navigator)) return;
  const isLocalhost =
    location.hostname === "localhost" ||
    location.hostname === "127.0.0.1" ||
    location.hostname === "[::1]";
  const isProd = location.protocol === "https:" && !isLocalhost;
  if (!isProd) return;
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch((err) => {
      console.error("SW registration failed:", err);
    });
  });
})();
