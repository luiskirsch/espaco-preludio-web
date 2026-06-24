// Service Worker — Espaço Prelúdio App (PWA)
const CACHE = "ep-app-v1";
const PRECACHE = [
  "/app/index.html",
  "/app/login.html",
  "/app/home.html",
  "/app/buscar.html",
  "/app/agendar.html",
  "/app/consultas.html",
  "/app/documentos.html",
  "/app/perfil.html",
  "/app/humor.html",
  "/app/chat.html",
  "/app/dependentes.html",
  "/app/app.css",
  "/app/manifest.json",
  "/logo_oficial_fundo_transparente.png?v=2",
];

self.addEventListener("install", e => {
  self.skipWaiting();
  e.waitUntil(
    caches.open(CACHE).then(c => c.addAll(PRECACHE).catch(() => {}))
  );
});

self.addEventListener("activate", e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", e => {
  // Só intercepta requisições do app (não do backend)
  if (!e.request.url.includes("/app/") && !e.request.url.endsWith(".css") && !e.request.url.includes("logo_oficial")) return;
  e.respondWith(
    caches.match(e.request).then(cached => {
      if (cached) return cached;
      return fetch(e.request).then(res => {
        if (res.ok && e.request.method === "GET") {
          const clone = res.clone();
          caches.open(CACHE).then(c => c.put(e.request, clone));
        }
        return res;
      }).catch(() => cached);
    })
  );
});

// Push notifications
self.addEventListener("push", e => {
  const data = e.data?.json().catch(() => ({})) || {};
  const title = data.title || "Espaço Prelúdio";
  const body  = data.body  || "Você tem uma nova mensagem.";
  e.waitUntil(
    self.registration.showNotification(title, {
      body,
      icon: "/logo_oficial_fundo_transparente.png?v=2",
      badge: "/logo_oficial_fundo_transparente.png?v=2",
      data: { url: data.url || "/app/home.html" }
    })
  );
});

self.addEventListener("notificationclick", e => {
  e.notification.close();
  e.waitUntil(
    clients.matchAll({ type: "window" }).then(cs => {
      const url = e.notification.data?.url || "/app/home.html";
      const c = cs.find(x => x.url.includes("/app/"));
      if (c) { c.focus(); c.navigate(url); }
      else clients.openWindow(url);
    })
  );
});
