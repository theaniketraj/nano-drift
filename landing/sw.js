/* ─── Nano Drift Service Worker ───────────────────────────────────────────── */

const CACHE_VERSION = "v1";
const CACHE_STATIC  = `nd-static-${CACHE_VERSION}`;
const CACHE_DOCS    = `nd-docs-${CACHE_VERSION}`;

// Shell assets to pre-cache on install
const PRECACHE_ASSETS = [
  "./",
  "./index.html",
  "./styles.css",
  "./script.js",
  "./favicon.svg",
  // CDN assets served under the same origin via GitHub Pages — cached at runtime
];

// Docs markdown files – fetched on demand, cached for offline reading
const DOCS_PATHS = [
  "./docs/index.md",
  "./docs/getting-started.md",
  "./docs/configuration.md",
  "./docs/architecture.md",
  "./docs/rpc-protocol.md",
  "./docs/extension/README.md",
  "./docs/daemon/README.md",
  "./docs/contributing.md",
];

// ── Install ─────────────────────────────────────────────────────────────────
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_STATIC)
      .then((cache) => cache.addAll(PRECACHE_ASSETS))
      .then(() => globalThis.skipWaiting()),
  );
});

// ── Activate: prune old caches ───────────────────────────────────────────────
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((k) => k !== CACHE_STATIC && k !== CACHE_DOCS)
            .map((k) => caches.delete(k)),
        ),
      )
      .then(() => globalThis.clients.claim()),
  );
});

// ── Fetch strategy ───────────────────────────────────────────────────────────
// Markdown docs  → stale-while-revalidate (offline fallback)
// CDN scripts    → stale-while-revalidate
// HTML shell     → network-first (always fresh)
// Everything else → network-first with cache fallback
self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Only handle GET requests over http(s)
  if (request.method !== "GET") return;
  if (!url.protocol.startsWith("http")) return;

  // Markdown docs — stale-while-revalidate
  if (url.pathname.endsWith(".md")) {
    event.respondWith(staleWhileRevalidate(CACHE_DOCS, request));
    return;
  }

  // CDN assets (fonts, hljs, marked, FA) — stale-while-revalidate
  const cdnHosts = [
    "fonts.googleapis.com",
    "fonts.gstatic.com",
    "cdn.jsdelivr.net",
  ];
  if (cdnHosts.some((h) => url.hostname.includes(h))) {
    event.respondWith(staleWhileRevalidate(CACHE_STATIC, request));
    return;
  }

  // HTML shell — network-first
  if (request.headers.get("accept")?.includes("text/html")) {
    event.respondWith(networkFirst(CACHE_STATIC, request));
    return;
  }

  // Static assets (CSS, JS, SVG, PNG) — stale-while-revalidate
  event.respondWith(staleWhileRevalidate(CACHE_STATIC, request));
});

// ── Helpers ──────────────────────────────────────────────────────────────────
async function staleWhileRevalidate(cacheName, request) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);

  const networkFetch = fetch(request)
    .then((res) => {
      if (res?.status === 200) {
        cache.put(request, res.clone());
      }
      return res;
    })
    .catch(() => null);

  return cached ?? (await networkFetch) ?? offlineFallback();
}

async function networkFirst(cacheName, request) {
  try {
    const res = await fetch(request);
    if (res?.status === 200) {
      const cache = await caches.open(cacheName);
      cache.put(request, res.clone());
    }
    return res;
  } catch {
    const cached = await caches.match(request);
    return cached ?? offlineFallback();
  }
}

function offlineFallback() {
  return new Response(
    `<!doctype html><html lang="en"><head><meta charset="UTF-8"/><title>Offline — Nano Drift</title>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<style>body{font-family:system-ui,sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;background:#0d0d0d;color:#ebebeb;text-align:center}h1{font-size:1.5rem;font-weight:700;margin-bottom:.5rem}p{color:#9a9a9a;font-size:.9375rem}</style>
</head><body><div><h1>You're offline</h1><p>Connect to the internet to view Nano Drift docs.</p></div></body></html>`,
    { headers: { "Content-Type": "text/html" } },
  );
}

// ── Message: force update ────────────────────────────────────────────────────
self.addEventListener("message", (event) => {
  if (event.data?.type === "SKIP_WAITING") globalThis.skipWaiting();
});
