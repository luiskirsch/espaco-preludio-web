// Espaço Prelúdio — badges de contagem nos 4 menus admin.
// Bate em paralelo nos 4 endpoints de listagem (status=pending) e injeta
// numero ao lado de cada link. Polling a cada 60s pra refrescar enquanto
// admin tem a aba aberta — feedback ao vivo de fila crescendo sem reload.
//
// Por que aqui (frontend, paralelo) e nao um endpoint backend agregador:
// evita criar nova rota + redeploy. Os 4 endpoints ja existem, latencia
// somada com Promise.all e ~ max(t1..t4), barato.
//
// IDs esperados no DOM (criados nos HTMLs admin):
//   #navBadgeCrpCrm        — admin-verificacoes.html
//   #navBadgeEstudante     — admin-comprovantes.html
//   #navBadgeRecemFormado  — admin-comprovantes-recem-formado.html
//   #navBadgeSemConselho   — admin-comprovantes-formacao.html
// Cada um e <span class="ep-nav-badge ep-hide">. Hidden quando count=0.

import { BACKEND_BASE_URL } from "./firebase-config.js";

const ENDPOINTS = [
  { url: "/therapy/admin/verificacoes?status=pending",                     badgeId: "navBadgeCrpCrm" },
  { url: "/therapy/admin/comprovantes-estudante?status=pending-review",    badgeId: "navBadgeEstudante" },
  { url: "/therapy/admin/comprovantes-recem-formado?status=pending-review", badgeId: "navBadgeRecemFormado" },
  { url: "/therapy/admin/comprovantes-formacao?status=pending-review",      badgeId: "navBadgeSemConselho" }
];

async function fetchCount(url, idToken) {
  try {
    const res = await fetch(BACKEND_BASE_URL + url, {
      headers: { Authorization: `Bearer ${idToken}` }
    });
    if (!res.ok) return null;
    const data = await res.json().catch(() => ({}));
    if (!data.ok) return null;
    return Array.isArray(data.items) ? data.items.length : 0;
  } catch {
    return null;
  }
}

function applyBadge(badgeId, count) {
  const el = document.getElementById(badgeId);
  if (!el) return;
  if (typeof count !== "number" || count <= 0) {
    el.classList.add("ep-hide");
    return;
  }
  el.textContent = count > 99 ? "99+" : String(count);
  el.classList.remove("ep-hide");
}

export async function refreshNavBadges(idToken) {
  if (!idToken) return;
  await Promise.all(ENDPOINTS.map(async (ep) => {
    const count = await fetchCount(ep.url, idToken);
    applyBadge(ep.badgeId, count);
  }));
}

// Inicia polling. Retorna handle de intervalo pra caller poder parar se quiser.
export function startNavBadgePolling(getIdToken, intervalMs = 60_000) {
  const tick = async () => {
    const token = typeof getIdToken === "function" ? await getIdToken() : getIdToken;
    if (token) refreshNavBadges(token);
  };
  tick();
  return setInterval(tick, intervalMs);
}
