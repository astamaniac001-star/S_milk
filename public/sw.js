/* ============================================================================
 * MILK DELIVERY ADMIN — V21 (Security Patched)
 * FILE 1: sw.js  (Service Worker — place in project root / public/)
 * ============================================================================
 *
 * Cache strategy:
 *   /assets/*    → Cache-first  (Vite content-hashed bundles — safe forever)
 *   Shell files  → Cache-first  (updated when CACHE name is bumped)
 *   Supabase/API → Network-only (NEVER cache — prevents data leakage)
 *   Everything else → Network-first with cache fallback
 * ============================================================================ */

const CACHE = "milk-v21"; // Bumped from v20 to force cache eviction on client devices
const SHELL = [
  "/",
  "/index.html",
  "/app.css",
  "/favicon.svg",
  "/icons.svg",
  "/apple-touch-icon.png",
  "/icon-512.png",
];

// ── discoverAssets: read hashed bundle URLs from the live index.html ──────────
function _extractScriptUrls(html) {
  const urls = new Set();
  for (const m of html.matchAll(/<script[^>]+src=["']([^"']+)["']/gi)) {
    urls.add(m[1]);
  }
  return urls;
}

function _extractLinkUrls(html) {
  const urls = new Set();
  for (const m of html.matchAll(/<link[^>]+href=["']([^"']+)["']/gi)) {
    urls.add(m[1]);
  }
  return urls;
}

// SECURITY HARDENING: Only allow caching of safe, same-origin asset extensions
// This mitigates the risk of a compromised build pipeline injecting malicious scripts.
function _isSafeAsset(pathname) {
  return /\.(js|css|json|png|svg|webmanifest|woff2?|ttf|ico)(\?.*)?$/i.test(
    pathname,
  );
}

function _normalizeUrls(urls, origin) {
  return [...urls]
    .map((u) => {
      try {
        return new URL(u, origin);
      } catch {
        return null;
      }
    })
    .filter((u) => {
      // Must be same-origin AND have a safe file extension
      return u && u.origin === origin && _isSafeAsset(u.pathname);
    })
    .map((u) => u.pathname);
}

async function discoverAssets() {
  const urls = new Set();
  try {
    const res = await fetch("/index.html", { cache: "no-store" });
    if (!res.ok) return [];
    const html = await res.text();

    _extractScriptUrls(html).forEach((u) => urls.add(u));
    _extractLinkUrls(html).forEach((u) => urls.add(u));
  } catch (err) {
    console.warn(
      "[SW] discoverAssets failed, precaching SHELL only:",
      err.message,
    );
    return [];
  }

  return _normalizeUrls(urls, self.location.origin);
}

// ── Install: pre-cache shell + hashed bundles ────────────────────────────────
self.addEventListener("install", (e) => {
  e.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE);
      const discovered = await discoverAssets();
      const toCache = [...SHELL, ...discovered];
      await Promise.all(
        toCache.map((url) =>
          cache
            .add(new Request(url, { cache: "reload" }))
            .catch((err) =>
              console.warn("[SW] Cache install skipped:", url, err.message),
            ),
        ),
      );
      self.skipWaiting();
    })(),
  );
});

// ── Activate: evict old caches ────────────────────────────────────────────────
self.addEventListener("activate", (e) => {
  e.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter((k) => k.startsWith("milk-") && k !== CACHE)
          .map((k) => caches.delete(k)),
      );
      await self.clients.claim();
    })(),
  );
});

// ── Fetch: routing strategy ───────────────────────────────────────────────────

// CRITICAL SECURITY FIX: Explicitly block caching for direct Supabase calls.
// Since the app talks straight to Supabase, the pathname is /rest/v1/ or /auth/v1/,
// NOT /api or /functions. We must check the hostname to be safe.
function _isApiCall(url) {
  const parsedUrl = new URL(url);

  // 1. Block ANY request going directly to Supabase
  if (parsedUrl.hostname.includes("supabase.co")) {
    return true;
  }

  // 2. Block local proxy paths (if you ever add them)
  const path = parsedUrl.pathname;
  return (
    path.startsWith("/api") ||
    path.startsWith("/functions") ||
    path.startsWith("/rest/v1") ||
    path.startsWith("/auth/v1")
  );
}

async function _fetchAndCache(request) {
  if (request.method !== "GET") {
    return fetch(request);
  }
  const fresh = await fetch(request);
  if (fresh.ok) {
    const cache = await caches.open(CACHE);
    cache.put(request, fresh.clone());
  }
  return fresh;
}

async function _cacheMatchOrError(request) {
  const cached = await caches.match(request);
  return cached || new Response("", { status: 503 });
}

async function _handleAssetRequest(request) {
  const cached = await caches.match(request);
  if (cached) return cached;
  try {
    return await _fetchAndCache(request);
  } catch {
    return await _cacheMatchOrError(request);
  }
}

function _getOfflineFallback(request) {
  if (request.mode === "navigate") {
    return new Response("<h1>Offline</h1><p>Reconnect and refresh.</p>", {
      status: 503,
      headers: { "Content-Type": "text/html" },
    });
  }
  return new Response("", { status: 503 });
}

async function _handleShellRequest(request) {
  const cached = await caches.match(request);
  if (cached) return cached;
  try {
    return await _fetchAndCache(request);
  } catch {
    const fallback = await caches.match("/index.html");
    return fallback || _getOfflineFallback(request);
  }
}

async function _handleNetworkFirstRequest(request) {
  try {
    return await _fetchAndCache(request);
  } catch {
    return await _cacheMatchOrError(request);
  }
}

function _isShellUrl(path) {
  return path === "/" || SHELL.includes(path);
}

function determineFetchStrategy(url) {
  if (_isApiCall(url)) return "pass-through"; // <-- Supabase calls hit this now!
  if (url.pathname.startsWith("/assets/")) return "asset";
  if (_isShellUrl(url.pathname)) return "shell";
  return "network-first";
}

const STRATEGY_HANDLERS = {
  asset: _handleAssetRequest,
  shell: _handleShellRequest,
  "network-first": _handleNetworkFirstRequest,
};

self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  const strategy = determineFetchStrategy(url);
  const handler = STRATEGY_HANDLERS[strategy];

  // 'pass-through' is not in the map, so handler will be undefined.
  // The browser handles the request natively (Network-only), preventing caching.
  if (handler) {
    e.respondWith(handler(e.request));
  }
});

// ── Message: SKIP_WAITING (for update-on-refresh UX) ─────────────────────────
self.addEventListener("message", (e) => {
  if (e.data?.type === "SKIP_WAITING") self.skipWaiting();
});
