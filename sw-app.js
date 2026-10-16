// Service Worker — Espaço Prelúdio App
// Documentos usam network-first para nunca prender o app em uma versão antiga.
// Apenas ativos estáticos do mesmo domínio usam cache com revalidação.

const VERSION = "ep-app-v30-2026-10-16-private-cache";
const STATIC_CACHE = `static-${VERSION}`;
const PAGE_CACHE = `pages-${VERSION}`;
const OFFLINE_PAGE = "/app/login.html";
const PRECACHE = [
  "/css/responsive.css?v=20261011b",
  OFFLINE_PAGE,
  "/app/app.css?v=20261005b",
  "/app/weather-hero.css?v=20261002f",
  "/app/assets/home-sky-clouds.webp",
  "/app/portal-shell.js?v=6",
  "/app/jornada.html",
  "/app/nr1.html",
  "/app/emergencia.html",
  "/app/manifest.json",
  "/logo_oficial_fundo_transparente.png?v=2",
  "/logo-144.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(STATIC_CACHE);
    await Promise.allSettled(PRECACHE.map(async url => {
      const response = await fetch(url, { cache: "no-store" });
      if (response.ok && !/no-store|private/i.test(response.headers.get("Cache-Control") || "")) {
        await cache.put(url, response);
      }
    }));
    self.skipWaiting();
  })());
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const current = new Set([STATIC_CACHE, PAGE_CACHE]);
    const keys = await caches.keys();
    await Promise.all(keys.filter((key) => !current.has(key)).map((key) => caches.delete(key)));
    await self.clients.claim();
  })());
});

function isSameOrigin(request) {
  return new URL(request.url).origin === self.location.origin;
}

function isStaticAsset(request) {
  return ["style", "script", "image", "font"].includes(request.destination)
    || /\.(css|js|svg|png|jpe?g|webp|woff2?|ttf)(\?|$)/i.test(request.url);
}

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET" || !isSameOrigin(request)) return;
  if (request.headers.has("Authorization")) return;
  if ([...new URL(request.url).searchParams.keys()].some(key => /token|code|secret|password/i.test(key))) return;

  if (request.mode === "navigate" || request.destination === "document") {
    event.respondWith((async () => {
      try {
        const fresh = await fetch(request, { cache: "no-store" });
        if (fresh.ok && !/no-store|private/i.test(fresh.headers.get("Cache-Control") || "")) {
          const cache = await caches.open(PAGE_CACHE);
          cache.put(request, fresh.clone()).catch(() => {});
        }
        return fresh;
      } catch {
        return (await caches.match(request))
          || (await caches.match(OFFLINE_PAGE))
          || new Response("Offline", { status: 503, headers: { "Content-Type": "text/plain; charset=utf-8" } });
      }
    })());
    return;
  }

  if (isStaticAsset(request)) {
    event.respondWith((async () => {
      const cached = await caches.match(request);
      const refresh = fetch(request).then((response) => {
        if (response.ok && !/no-store|private/i.test(response.headers.get("Cache-Control") || "")) {
          caches.open(STATIC_CACHE).then((cache) => cache.put(request, response.clone())).catch(() => {});
        }
        return response;
      }).catch(() => null);
      return cached || (await refresh) || new Response("", { status: 504 });
    })());
  }
});

function notificationTarget(value, fallback = "/app/home.html") {
  try {
    const target = new URL(String(value || fallback), self.location.origin);
    if (target.origin !== self.location.origin) return fallback;
    return `${target.pathname}${target.search}${target.hash}`;
  } catch {
    return fallback;
  }
}

self.addEventListener("push", (event) => {
  let data = {};
  try {
    if (event.data) data = event.data.json();
  } catch { /* usa o payload padrão */ }

  event.waitUntil(self.registration.showNotification(data.title || "Espaço Prelúdio", {
    body: data.body || "Você tem uma nova mensagem.",
    icon: "/logo_oficial_fundo_transparente.png?v=2",
    badge: "/logo_oficial_fundo_transparente.png?v=2",
    data: { url: notificationTarget(data.url) },
  }));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = notificationTarget(event.notification?.data?.url);
  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    const existing = windows.find((client) => client.url.startsWith(self.location.origin));
    if (existing) {
      await existing.focus();
      if ("navigate" in existing) await existing.navigate(target);
      return;
    }
    await self.clients.openWindow(target);
  })());
});
