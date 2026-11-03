const CACHE = "sollicitatie-app-v31";
const FILES = ["./", "./index.html", "./styles.css", "./app.js", "./manifest.webmanifest", "./icon-192.png", "./icon-512.png"];

self.addEventListener("install", event => {
  event.waitUntil(
    caches.open(CACHE)
      .then(cache => cache.addAll(FILES))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(
      keys
        .filter(key => key.startsWith("sollicitatie-app-") && key !== CACHE)
        .map(key => caches.delete(key))
    );
    await self.clients.claim();
  })());
});

self.addEventListener("fetch", event => {
  const request = event.request;
  const url = new URL(request.url);

  if (request.method === "POST" && url.pathname.endsWith("/share-target/")) {
    event.respondWith((async () => {
      const form = await request.formData();
      const query = new URLSearchParams();
      for (const key of ["title", "text", "url"]) {
        const value = form.get(key);
        if (value) query.set(key, String(value));
      }
      query.set("shared", "1");
      return Response.redirect(new URL("./?" + query.toString(), self.location).toString(), 303);
    })());
    return;
  }

  if (request.method !== "GET" || url.origin !== self.location.origin) return;

  // Network-first prevents an old app shell or JavaScript bundle from
  // remaining active after a deployment. Cached files are an offline fallback.
  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    try {
      const response = await fetch(request);
      if (response && response.ok && response.type !== "opaque") {
        await cache.put(request, response.clone());
      }
      return response;
    } catch (error) {
      const cached = await caches.match(request);
      if (cached) return cached;
      if (request.mode === "navigate") {
        return (await caches.match("./index.html")) || Response.error();
      }
      return Response.error();
    }
  })());
});
