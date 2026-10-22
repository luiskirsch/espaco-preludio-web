// Service Worker — Espaço Prelúdio App
// Documentos usam network-first para nunca prender o app em uma versão antiga.
// Apenas ativos estáticos do mesmo domínio usam cache com revalidação.

const VERSION = "ep-app-v37-2026-10-22-apoio";
const STATIC_CACHE = `static-${VERSION}`;
const PAGE_CACHE = `pages-${VERSION}`;
const OFFLINE_PAGE = "/app/login.html";
// HTML e arquivos versionados não entram: o HTML chega com no-store (nunca era
// guardado) e JS/CSS/imagens com ?h= vão para o cache permanente na 1ª visita.
const PRECACHE = [
  "/app/manifest.json",
];
// Cache que sobrevive às versões do SW: o conteúdo de uma URL ?h= nunca muda.
const IMMUTABLE_CACHE = "immutable-v1";
const IMMUTABLE_MAX = 400;

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
    const current = new Set([STATIC_CACHE, PAGE_CACHE, IMMUTABLE_CACHE]);
    const keys = await caches.keys();
    await Promise.all(keys.filter((key) => !current.has(key)).map((key) => caches.delete(key)));
    try {
      const immutable = await caches.open(IMMUTABLE_CACHE);
      const entries = await immutable.keys();
      await Promise.all(entries.slice(0, Math.max(0, entries.length - IMMUTABLE_MAX)).map((key) => immutable.delete(key)));
    } catch { /* best-effort */ }
    await self.clients.claim();
  })());
});

function isSameOrigin(request) {
  return new URL(request.url).origin === self.location.origin;
}

// URLs versionadas pelo conteúdo (scripts/perf/build.mjs) e arquivos de idioma
// versionados pelo hash das traduções: imutáveis, servidos sem revalidar.
function isImmutable(request) {
  const target = new URL(request.url);
  return /^[0-9a-f]{10}$/.test(target.searchParams.get("h") || "")
    || (/\/i18n\/locales\/[^/]+\/[^/]+\.json$/.test(target.pathname) && /^a[0-9a-f]{8}$/.test(target.searchParams.get("v") || ""));
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

  if (isImmutable(request)) {
    event.respondWith((async () => {
      const cache = await caches.open(IMMUTABLE_CACHE);
      const hit = await cache.match(request);
      if (hit) return hit;
      try {
        const response = await fetch(request);
        if (response.ok && response.type === "basic") cache.put(request, response.clone()).catch(() => {});
        return response;
      } catch {
        return new Response("", { status: 504 });
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
    icon: "/logo_oficial_fundo_transparente.png?h=dfe07fa7a9",
    badge: "/logo_oficial_fundo_transparente.png?h=dfe07fa7a9",
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
