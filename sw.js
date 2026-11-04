const CACHE = "sollicitatie-app-v35";
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
      const sharedFiles = form.getAll("files").filter(value => value instanceof File && value.size > 0 && value.size <= 25 * 1024 * 1024).slice(0, 10);
      if (sharedFiles.length) {
        const cache = await caches.open("vacature-share-inbox-v1");
        const ids = [];
        for (const file of sharedFiles) {
          const id = crypto.randomUUID();
          const key = new Request(new URL("./__shared_files/" + encodeURIComponent(id), self.location).toString());
          const headers = new Headers({"Content-Type": file.type || "application/octet-stream", "X-File-Name": file.name || "gedeeld-bestand"});
          await cache.put(key, new Response(file, {headers}));
          ids.push(id);
        }
        query.set("sharedFiles", ids.join(","));
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
