// Minimal service worker: makes the app installable and provides an offline
// shell for the static assets. API calls (/api/*) always go to the network.
const CACHE = "mindtrainer-v1";
const SHELL = ["/", "/index.html", "/icon.svg", "/manifest.webmanifest"];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))),
    ),
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Never cache API traffic — lessons and tutor replies must be live.
  if (url.pathname.startsWith("/api/")) return;
  if (request.method !== "GET") return;

  // Network-first for navigations so new deploys show up; fall back to shell.
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request).catch(() => caches.match("/index.html")),
    );
    return;
  }

  // Cache-first for other same-origin GETs (static assets).
  if (url.origin === self.location.origin) {
    event.respondWith(
      caches.match(request).then((hit) => hit || fetch(request)),
    );
  }
});
