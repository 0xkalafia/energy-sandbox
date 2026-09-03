// Offline service worker.
//
// Two strategies, because the two kinds of request want opposite things:
//
//   navigation (the HTML)  -> network first, cache as a fallback
//   everything else        -> cache first, revalidate in the background
//
// It used to be stale-while-revalidate for both, and that is what manufactured
// the stale-build problem: the index is the one file whose contents change
// every deploy, and serving yesterday's copy hands the browser a list of chunk
// hashes the server no longer has. Verified by `npm run sw:check` — the tab
// asked for a chunk that wasn't there and the app fell back to its error
// boundary. Fetching the document from the network first removes the cause;
// the boundary stays as the net for someone whose tab was already open.
//
// Hashed assets are safe the other way round: their name changes when their
// contents do, so a cached copy can never be wrong, and cache-first spares a
// revalidation round trip on every load.
const CACHE = "energy-sandbox-v3";

self.addEventListener("install", (e) => {
  self.skipWaiting();
  e.waitUntil(
    caches
      .open(CACHE)
      .then((c) => c.add("/"))
      .catch(() => {}), // a failed pre-cache shouldn't block installing
  );
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET" || new URL(req.url).origin !== self.location.origin) {
    return; // leave cross-origin (fonts) and non-GET alone
  }

  if (req.mode === "navigate") {
    e.respondWith(
      fetch(req)
        .then((res) => {
          if (res.ok) {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put("/", copy));
          }
          return res;
        })
        // Offline: last known good index, so the app still opens.
        .catch(async () => (await caches.match("/")) ?? Response.error()),
    );
    return;
  }

  e.respondWith(
    caches.open(CACHE).then(async (cache) => {
      const cached = await cache.match(req);
      const network = fetch(req)
        .then((res) => {
          if (res.ok) cache.put(req, res.clone());
          return res;
        })
        .catch(() => cached);
      return cached || network;
    }),
  );
});
