/* Service worker — network-first for the app shell so every launch gets the
   latest code when online, with an offline cache fallback. Bump CACHE on changes. */
const CACHE = "gymjournal-v16";
const ASSETS = [
  "./",
  "./index.html",
  "./css/styles.css",
  "./js/app.js",
  "./manifest.webmanifest",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/apple-touch-icon.png"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(ASSETS)).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  const url = new URL(event.request.url);
  // Never intercept cross-origin requests (e.g. the GitHub sync API).
  if (url.origin !== location.origin) return;

  // Network-first: always try the network so updates land immediately;
  // fall back to cache when offline.
  event.respondWith(
    fetch(event.request)
      .then((resp) => {
        if (resp.ok) {
          const clone = resp.clone();
          caches.open(CACHE).then((c) => c.put(event.request, clone));
        }
        return resp;
      })
      .catch(() => caches.match(event.request).then((c) => c || caches.match("./index.html")))
  );
});
