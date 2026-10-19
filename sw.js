// Service Worker do Espaço Prelúdio
// Estratégia:
//   - HTML: NETWORK-FIRST — garante a versão atual e usa cache como fallback.
//   - CSS/JS/SVG/font (estáticos): cache-first com revalidação background.
//   - APIs (backend Railway): NUNCA cacheia — passa direto pelo fetch.
//   - Push: handler de notificação + click pra abrir o painel.
//
// Bump SW_VERSION pra forçar refresh do cache em todas as instalações.

const SW_VERSION = "ep-sw-v23-2026-10-18-perf";
const PRECACHE   = `precache-${SW_VERSION}`;
const RUNTIME    = `runtime-${SW_VERSION}`;

// Páginas HTML não entram: chegam com Cache-Control no-store e nunca eram
// guardadas, mas eram baixadas a cada atualização do SW. JS/CSS/imagens com
// ?h= (hash do conteúdo) vão para o cache permanente na primeira visita.
const PRECACHE_URLS = [
  "/manifest.webmanifest"
];
// Cache que sobrevive às versões do SW: o conteúdo de uma URL ?h= nunca muda.
const IMMUTABLE = "immutable-v1";
const IMMUTABLE_MAX = 400;

self.addEventListener("install", (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(PRECACHE);
    // Best-effort: falhas individuais (404, network) não derrubam o install.
    await Promise.allSettled(PRECACHE_URLS.map(async u => {
      const response = await fetch(u, { cache: "no-store" });
      if (response.ok && !/no-store|private/i.test(response.headers.get("Cache-Control") || "")) {
        await cache.put(u, response);
      }
    }));
    // skipWaiting INCONDICIONAL — usuário tava preso em versão antiga
    // mesmo com toast de update aparecendo. Prefere reload involuntário
    // ao "preso pra sempre". Quando o SW novo ativar, pwa.js detecta
    // controllerchange e recarrega — pega tudo novo da rede.
    self.skipWaiting();
  })());
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    // Limpa TODOS os caches de versões antigas — runtime caches de HTML/
    // CSS/JS velhos que estavam servindo a versão presa do user.
    const keys = await caches.keys();
    await Promise.all(keys
      .filter(k => k !== PRECACHE && k !== RUNTIME && k !== IMMUTABLE)
      .map(k => caches.delete(k)));
    await pruneImmutable();
    await self.clients.claim();
  })());
});

// URLs versionadas pelo conteúdo (scripts/perf/build.mjs) e arquivos de idioma
// versionados pelo hash das traduções: imutáveis.
function isImmutable(target) {
  return /^[0-9a-f]{10}$/.test(target.searchParams.get("h") || "")
    || (/\/i18n\/locales\/[^/]+\/[^/]+\.json$/.test(target.pathname) && /^a[0-9a-f]{8}$/.test(target.searchParams.get("v") || ""));
}
async function cacheFirstImmutable(req) {
  const cache = await caches.open(IMMUTABLE);
  const hit = await cache.match(req);
  if (hit) return hit;
  const res = await fetch(req);
  if (res.ok && res.type === "basic") cache.put(req, res.clone()).catch(() => {});
  return res;
}
// Versões antigas de cada arquivo ficam para trás: mantém só as mais recentes.
async function pruneImmutable() {
  try {
    const cache = await caches.open(IMMUTABLE);
    const keys = await cache.keys();
    await Promise.all(keys.slice(0, Math.max(0, keys.length - IMMUTABLE_MAX)).map(k => cache.delete(k)));
  } catch { /* best-effort */ }
}

function isApiRequest(url) {
  // Backend Railway + auth endpoints — não cacheamos por design.
  return /osl-video-server.*\.up\.railway\.app/.test(url) ||
         url.includes("/api/") ||
         url.includes("identitytoolkit.googleapis.com") ||
         url.includes("/firebasestorage") ||
         url.includes("livekit");
}

function isStaticAsset(url, dest) {
  if (dest === "style" || dest === "script" || dest === "image" || dest === "font") return true;
  return /\.(css|js|svg|png|jpe?g|webp|woff2?|ttf)(\?|$)/.test(url);
}

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = req.url;
  const target = new URL(url);
  if (target.origin !== self.location.origin || req.headers.has("Authorization")) return;
  if ([...target.searchParams.keys()].some(key => /token|code|secret|password/i.test(key))) return;

  // API: passa direto, sem tocar no cache.
  if (isApiRequest(url)) return;

  // HTML / navegação: NETWORK-FIRST — busca da rede primeiro, cache só
  // como fallback offline. Trade-off vs SWR: load levemente mais lento
  // em conexão boa, mas GARANTE que usuário nunca fica preso em versão
  // antiga (SWR estava deixando usuários presos por dias quando o
  // background revalidation falhava ou não chegava a executar).
  if (req.mode === "navigate" || req.destination === "document") {
    event.respondWith((async () => {
      try {
        const fresh = await fetch(req);
        if (fresh && fresh.ok && !/no-store|private/i.test(fresh.headers.get("Cache-Control") || "")) {
          const cache = await caches.open(RUNTIME);
          cache.put(req, fresh.clone()).catch(() => {});
        }
        return fresh;
      } catch (e) {
        // Offline: tenta cache, senão painel precacheado, senão erro.
        const cached = await caches.match(req);
        if (cached) return cached;
        const fallback = await caches.match("/painel.html");
        if (fallback) return fallback;
        return new Response("Offline", { status: 503 });
      }
    })());
    return;
  }

  if (isImmutable(target)) {
    event.respondWith(cacheFirstImmutable(req).catch(() => new Response("", { status: 504 })));
    return;
  }

  // Estáticos: cache-first, atualiza background.
  if (isStaticAsset(url, req.destination)) {
    event.respondWith((async () => {
      const cached = await caches.match(req);
      const networkPromise = fetch(req).then(res => {
        // Só cacheia se OK e mesmo origin (evita lixo de CDN cross-origin sem CORS).
        if (res.ok && !/no-store|private/i.test(res.headers.get("Cache-Control") || "")) {
          const clone = res.clone();
          caches.open(RUNTIME).then(c => c.put(req, clone)).catch(() => {});
        }
        return res;
      }).catch(() => null);
      return cached || (await networkPromise) || new Response("", { status: 504 });
    })());
    return;
  }

  // Outros: passa direto.
});

// ─── Push notifications ───────────────────────────────────────────────
// Payload esperado (JSON): { title, body, url?, tag? }
// Fallback se payload vazio ou inválido.
self.addEventListener("push", (event) => {
  let payload = { title: "Espaço Prelúdio", body: "Você tem uma nova atualização." };
  try {
    if (event.data) {
      const parsed = event.data.json();
      payload = { ...payload, ...parsed };
    }
  } catch { /* mantém default */ }

  const options = {
    body: payload.body,
    icon: "/logo_oficial_fundo_transparente.png",
    badge: "/logo_oficial_fundo_transparente.png",
    tag: payload.tag || "ep-default",
    data: { url: notificationTarget(payload.url) },
    requireInteraction: false,
    renotify: !!payload.tag
  };

  event.waitUntil(self.registration.showNotification(payload.title || "Espaço Prelúdio", options));
});

function notificationTarget(value, fallback = "/painel.html") {
  try {
    const target = new URL(String(value || fallback), self.location.origin);
    if (target.origin !== self.location.origin) return fallback;
    return `${target.pathname}${target.search}${target.hash}`;
  } catch {
    return fallback;
  }
}

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = notificationTarget(event.notification?.data?.url);

  event.waitUntil((async () => {
    const allClients = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    // Se já tem uma aba aberta do site, foca + navega.
    for (const c of allClients) {
      if (c.url.startsWith(self.location.origin)) {
        await c.focus();
        if ("navigate" in c) await c.navigate(target);
        return;
      }
    }
    // Caso contrário, abre nova.
    await self.clients.openWindow(target);
  })());
});

// Mensagens da página → SW (ex.: forçar update via "SKIP_WAITING").
self.addEventListener("message", (event) => {
  if (event.data?.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
});
