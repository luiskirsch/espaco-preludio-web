// Service Worker do Espaço Prelúdio
// Estratégia:
//   - HTML: network-first com fallback pra cache (offline-tolerant; sempre
//     prefere versão fresca quando online porque o cache-buster fica em CSS/JS).
//   - CSS/JS/SVG/font (estáticos): cache-first com revalidação background.
//   - APIs (backend Railway): NUNCA cacheia — passa direto pelo fetch.
//   - Push: handler de notificação + click pra abrir o painel.
//
// Bump SW_VERSION pra forçar refresh do cache em todas as instalações.

const SW_VERSION = "ep-sw-v1-2026-05-13";
const PRECACHE   = `precache-${SW_VERSION}`;
const RUNTIME    = `runtime-${SW_VERSION}`;

const PRECACHE_URLS = [
  "/painel.html",
  "/agenda.html",
  "/pacientes.html",
  "/perfil.html",
  "/financeiro.html",
  "/relatorios.html",
  "/favicon.svg",
  "/manifest.webmanifest"
];

self.addEventListener("install", (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(PRECACHE);
    // Best-effort: falhas individuais (404, network) não derrubam o install.
    await Promise.allSettled(PRECACHE_URLS.map(u => cache.add(u)));
    self.skipWaiting();
  })());
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    // Limpa caches de versões antigas.
    const keys = await caches.keys();
    await Promise.all(keys
      .filter(k => k !== PRECACHE && k !== RUNTIME)
      .map(k => caches.delete(k)));
    await self.clients.claim();
  })());
});

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

  // API: passa direto, sem tocar no cache.
  if (isApiRequest(url)) return;

  // HTML / navegação: network-first com fallback de cache.
  if (req.mode === "navigate" || req.destination === "document") {
    event.respondWith((async () => {
      try {
        const fresh = await fetch(req);
        // Atualiza cache em background pro próximo offline.
        const cache = await caches.open(RUNTIME);
        cache.put(req, fresh.clone()).catch(() => {});
        return fresh;
      } catch (e) {
        const cached = await caches.match(req);
        if (cached) return cached;
        // Fallback final: painel cacheado no precache (online estará indo).
        const fallback = await caches.match("/painel.html");
        if (fallback) return fallback;
        throw e;
      }
    })());
    return;
  }

  // Estáticos: cache-first, atualiza background.
  if (isStaticAsset(url, req.destination)) {
    event.respondWith((async () => {
      const cached = await caches.match(req);
      const networkPromise = fetch(req).then(res => {
        // Só cacheia se OK e mesmo origin (evita lixo de CDN cross-origin sem CORS).
        if (res.ok && (req.url.startsWith(self.location.origin) || res.type === "basic" || res.type === "cors")) {
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
    icon: "/favicon.svg",
    badge: "/favicon.svg",
    tag: payload.tag || "ep-default",
    data: { url: payload.url || "/painel.html" },
    requireInteraction: false,
    renotify: !!payload.tag
  };

  event.waitUntil(self.registration.showNotification(payload.title || "Espaço Prelúdio", options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = event.notification?.data?.url || "/painel.html";

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
