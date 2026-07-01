/* Service worker — network-first for the app shell so every launch gets the
   latest code when online, with an offline cache fallback. Bump CACHE on changes. */
const CACHE = "gymjournal-v18";
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

  // Network-first with a 4s cap: updates land immediately on a good
  // connection, but a slow/hung network falls back to cache instead of
  // making the app hang at launch. Offline falls back to cache too.
  event.respondWith((async () => {
    try {
      const resp = await Promise.race([
        fetch(event.request).then((r) => {
          if (r.ok) {
            const clone = r.clone();
            caches.open(CACHE).then((c) => c.put(event.request, clone));
          }
          return r;
        }),
        new Promise((_, reject) => setTimeout(() => reject(new Error("sw-timeout")), 4000))
      ]);
      return resp;
    } catch (e) {
      const cached = await caches.match(event.request);
      if (cached) return cached;
      // No cache and network slow: give the network one last real chance.
      try { return await fetch(event.request); }
      catch (e2) { return caches.match("./index.html"); }
    }
  })());
});
