const SW_VERSION = "degururu-pwa-v6";
const STATIC_CACHE = `${SW_VERSION}-static`;
const RUNTIME_CACHE = `${SW_VERSION}-runtime`;
const PRECACHE_URLS = [
  "/",
  "/index.html",
  "/styles.css",
  "/manifest.webmanifest",
  "/manifest-en.webmanifest",
  "/offline.html",
  "/privacy-policy.html",
  "/pinball-game.html",
  "/pinball-ladder.html",
  "/static-page-i18n.js",
  "/favicon.ico",
  "/assets/favicon-48.png",
  "/assets/favicon-96.png",
  "/assets/og-image.png",
  "/assets/pwa-192.png",
  "/assets/pwa-512.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(STATIC_CACHE)
      .then((cache) => cache.addAll(PRECACHE_URLS))
      .catch(() => undefined)
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key !== STATIC_CACHE && key !== RUNTIME_CACHE)
            .map((key) => caches.delete(key))
        )
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener("message", (event) => {
  if (!event || !event.data || event.data.type !== "SKIP_WAITING") return;
  self.skipWaiting();
});

function isApiRequest(url) {
  return url.pathname.startsWith("/api/");
}

async function networkFirst(request) {
  try {
    const response = await fetch(request);
    if (response && response.ok) {
      const cache = await caches.open(RUNTIME_CACHE);
      try {
        const cacheable = response.clone();
        cache.put(request, cacheable).catch(() => undefined);
      } catch (_cloneError) {
        // Ignore clone failures for non-cloneable/consumed responses.
      }
    }
    return response;
  } catch (_err) {
    const cached = await caches.match(request);
    if (cached) return cached;
    return caches.match("/offline.html");
  }
}

async function staleWhileRevalidate(request) {
  const cached = await caches.match(request);
  const fetchPromise = fetch(request)
    .then((response) => {
      if (response && response.ok) {
        try {
          const cacheable = response.clone();
          caches
            .open(RUNTIME_CACHE)
            .then((cache) => cache.put(request, cacheable))
            .catch(() => undefined);
        } catch (_cloneError) {
          // Ignore clone failures for non-cloneable/consumed responses.
        }
      }
      return response;
    })
    .catch(() => undefined);

  if (cached) return cached;
  const fresh = await fetchPromise;
  if (fresh) return fresh;
  return caches.match("/offline.html");
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (!request || request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (isApiRequest(url)) {
    event.respondWith(fetch(request));
    return;
  }

  if (request.mode === "navigate") {
    event.respondWith(networkFirst(request));
    return;
  }

  const destination = request.destination;
  const shouldUseStaleWhileRevalidate =
    destination === "style" ||
    destination === "script" ||
    destination === "font" ||
    destination === "image" ||
    destination === "audio" ||
    destination === "video" ||
    url.pathname.startsWith("/assets/");

  if (shouldUseStaleWhileRevalidate) {
    event.respondWith(staleWhileRevalidate(request));
    return;
  }

  event.respondWith(networkFirst(request));
});
