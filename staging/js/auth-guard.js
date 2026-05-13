// Espaço Prelúdio — guard de autenticação para páginas que exigem profissional logado.
// Uso:
//   import { requireTherapist } from "./js/auth-guard.js";
//   const { user, idToken, therapist } = await requireTherapist();

import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";
import { auth, BACKEND_BASE_URL } from "./firebase-config.js";
import { recallDek } from "./crypto.js";
import { getTheme, toggleTheme } from "./theme.js";
import "./cmdk.js";

// ─── 2FA session ─────────────────────────────────────────────────────
const TWOFA_KEY = "ep:twofa-session";
const TWOFA_TTL_MS = 8 * 60 * 60 * 1000;

export function hasValid2faSession() {
  try {
    const raw = sessionStorage.getItem(TWOFA_KEY);
    if (!raw) return false;
    const entry = JSON.parse(raw);
    if (!entry?.token || !entry?.savedAt) return false;
    return (Date.now() - entry.savedAt) < TWOFA_TTL_MS;
  } catch { return false; }
}
export function save2faSession(token) {
  try { sessionStorage.setItem(TWOFA_KEY, JSON.stringify({ token, savedAt: Date.now() })); } catch {}
}
export function clear2faSession() {
  try { sessionStorage.removeItem(TWOFA_KEY); } catch {}
}

export function authReady() {
  return new Promise((resolve) => {
    const unsub = onAuthStateChanged(auth, (user) => {
      unsub();
      resolve(user || null);
    });
  });
}

// Cache do /me em sessionStorage. Stale-while-revalidate: dentro do TTL
// retorna o cache imediato e dispara refetch em background pra atualizar
// o cache pra próxima navegação. Resultado: 1ª página paga o roundtrip,
// subsequentes ficam instantâneas (~0ms vs. ~150-800ms).
//
// Invalidar via invalidateProfileCache() em logout, PATCH /perfil, troca
// de plano. TTL curto (30s) limita janela de staleness se invalidação
// faltar em algum lugar.
//
// Versão da chave: bumpar quando o shape do profile mudar OU quando precisar
// invalidar caches stale em todos os users (ex.: ajuste de capabilities no
// backend que muda a matriz pra um conselho).
const PROFILE_CACHE_KEY = "ep:profile:v2";
const PROFILE_CACHE_TTL_MS = 30_000;

function readProfileCache(uid) {
  try {
    const raw = sessionStorage.getItem(PROFILE_CACHE_KEY);
    if (!raw) return null;
    const entry = JSON.parse(raw);
    if (entry.uid !== uid) return null;
    if (Date.now() - entry.t > PROFILE_CACHE_TTL_MS) return null;
    return entry.profile;
  } catch { return null; }
}

function writeProfileCache(uid, profile) {
  try {
    sessionStorage.setItem(PROFILE_CACHE_KEY, JSON.stringify({ uid, t: Date.now(), profile }));
  } catch {}
}

export function invalidateProfileCache() {
  try {
    sessionStorage.removeItem(PROFILE_CACHE_KEY);
    // Limpa também a key antiga v1 caso ainda exista da sessão pré-bump.
    sessionStorage.removeItem("ep:profile:v1");
  } catch {}
}

// Invalida automaticamente em signOut ou troca de conta — listener global
// roda uma vez quando este módulo é importado. Evita ter que adicionar
// invalidateProfileCache() em cada handler de logout espalhado pelas páginas.
let lastSeenUid = null;
onAuthStateChanged(auth, (user) => {
  const uid = user?.uid || null;
  if (lastSeenUid && uid !== lastSeenUid) invalidateProfileCache();
  lastSeenUid = uid;
});

async function fetchProfileFromBackend(idToken) {
  const res = await fetch(`${BACKEND_BASE_URL}/therapy/profissional/me`, {
    headers: { "Authorization": `Bearer ${idToken}` }
  });
  if (res.status === 404) return { ok: false, code: "NAO_REGISTRADO" };
  const data = await res.json().catch(() => ({}));
  if (!res.ok) return { ok: false, code: data?.error || "ERRO_PERFIL" };
  return {
    ok: true,
    therapist: data.therapist,
    conselho: data.conselho || null,    // { sigla, label, profissional, capabilities }
    planAccess: data.planAccess || null
  };
}

function capsEqual(a, b) {
  const aa = [...(a || [])].sort();
  const bb = [...(b || [])].sort();
  if (aa.length !== bb.length) return false;
  for (let i = 0; i < aa.length; i++) if (aa[i] !== bb[i]) return false;
  return true;
}

export async function fetchTherapistProfile(idToken, uid) {
  // Sem uid (compat retro) → busca direto, sem cache.
  if (!uid) return fetchProfileFromBackend(idToken);

  const cached = readProfileCache(uid);
  if (cached) {
    // SWR: dispara revalidate em background, retorna cache imediato. Se
    // o fresh fetch trouxer capabilities diferentes (ex.: cache stale do
    // CRP, conta agora é CRM), reaplica visibility — link de feature
    // que antes estava escondido volta a aparecer sem precisar refresh.
    fetchProfileFromBackend(idToken)
      .then(fresh => {
        if (!fresh.ok) return;
        writeProfileCache(uid, fresh);
        if (!capsEqual(cached.conselho?.capabilities, fresh.conselho?.capabilities)) {
          applyCapabilityVisibility(fresh.conselho?.capabilities);
        }
      })
      .catch(() => {});
    return cached;
  }

  const fresh = await fetchProfileFromBackend(idToken);
  if (fresh.ok) writeProfileCache(uid, fresh);
  return fresh;
}

// Aplica visibilidade nos links de nav e botões com data-capability. Match
// por substring no href — "receita.html" exige capability "receita", e
// "documento.html" exige "documentos-clinicos".
//
// REVERSÍVEL: se a cap está habilitada, restaura display/aria-hidden ao
// estado natural — necessário pra quando o SWR refetch detecta que o user
// recuperou uma cap que estava escondida pelo cache stale.
//
// Backend continua sendo a fonte da verdade (requireCapability nos endpoints).
function applyCapabilityVisibility(capabilities) {
  const set = new Set(capabilities || []);
  const RULES = [
    { match: "receita.html",     capability: "receita" },
    { match: "documento.html",   capability: "documentos-clinicos" },
    { match: "calculadora.html", capability: "calculadora-clinica" }
  ];
  document.querySelectorAll("a[href], button[data-href]").forEach(el => {
    const href = (el.getAttribute("href") || el.getAttribute("data-href") || "").toLowerCase();
    for (const rule of RULES) {
      if (!href.includes(rule.match)) continue;
      if (!set.has(rule.capability)) {
        el.style.display = "none";
        el.setAttribute("aria-hidden", "true");
      } else {
        // Restaura — necessário se foi escondido por um call anterior.
        el.style.display = "";
        el.removeAttribute("aria-hidden");
      }
    }
  });
  document.querySelectorAll("[data-capability]").forEach(el => {
    const cap = el.getAttribute("data-capability");
    if (!cap) return;
    if (!set.has(cap)) {
      el.style.display = "none";
      el.setAttribute("aria-hidden", "true");
    } else {
      el.style.display = "";
      el.removeAttribute("aria-hidden");
    }
  });
}

// Botão flutuante de suporte — injetado em todas as páginas pós-login.
function mountHelpBubble() {
  if (typeof document === "undefined") return;
  const path = location.pathname.toLowerCase();
  if (path.endsWith("/suporte.html") || path.endsWith("/2fa-verify.html")) return;
  if (document.getElementById("epHelpBubble")) return;

  const a = document.createElement("a");
  a.id = "epHelpBubble";
  a.href = "./suporte.html";
  a.className = "ep-help-bubble";
  a.title = "Suporte e ajuda";
  a.setAttribute("aria-label", "Abrir suporte");
  a.innerHTML = `
    <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="10"></circle>
      <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"></path>
      <line x1="12" y1="17" x2="12.01" y2="17"></line>
    </svg>
  `;
  document.body.appendChild(a);
}

// Preenche o slot de perfil no topbar — avatar circular + nome clicável.
// O <a id="topProfileLink"> é o link pra perfil.html. Se a página não tiver
// o markup (ex.: páginas públicas), no-op silencioso.
//
// Foto: vem como data URL construída a partir de therapist.photoBase64 +
// therapist.photoMime (armazenamento inline no Firestore). Fallback pra
// iniciais quando não tem foto.
export function applyTopUserSlot(therapist) {
  const name = (therapist?.displayName || "").trim();
  const elName   = document.getElementById("topUserName");
  const elAvatar = document.getElementById("topUserAvatar");
  if (elName) elName.textContent = name || "Perfil";
  if (elAvatar) {
    const photoBase64 = therapist?.photoBase64 || "";
    const photoMime   = therapist?.photoMime   || "image/jpeg";
    if (photoBase64) {
      elAvatar.style.backgroundImage = `url(data:${photoMime};base64,${photoBase64})`;
      elAvatar.style.backgroundSize = "cover";
      elAvatar.style.backgroundPosition = "center";
      elAvatar.textContent = "";
    } else {
      elAvatar.style.backgroundImage = "";
      const initials = (name.match(/\b\p{L}/gu) || []).slice(0, 2).join("").toUpperCase() || "·";
      elAvatar.textContent = initials;
    }
    elAvatar.classList.add("ep-avatar-wrap");
    const old = elAvatar.querySelector(".ep-verified-badge");
    if (old) old.remove();
    if (therapist?.verificationStatus === "verified") {
      const badge = document.createElement("span");
      badge.className = "ep-verified-badge";
      badge.setAttribute("title", "Profissional verificado · inscrição no conselho confirmada");
      badge.setAttribute("aria-label", "Profissional verificado");
      badge.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 12l5 5L20 7" stroke-linecap="round" stroke-linejoin="round"/></svg>';
      elAvatar.appendChild(badge);
    }
  }
}

export function verifiedBadgeHtml(size) {
  const sz = size === "lg" ? " ep-verified-badge--lg" : size === "xl" ? " ep-verified-badge--xl" : "";
  return `<span class="ep-verified-badge${sz}" title="Profissional verificado · inscrição no conselho confirmada" aria-label="Profissional verificado"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 12l5 5L20 7" stroke-linecap="round" stroke-linejoin="round"/></svg></span>`;
}

// Prefetch HTML das páginas do nav após render — próxima navegação chega
// pré-carregada do disk cache. Custo: ~30-100KB por página em background,
// pago uma vez por sessão. Ganho: clique vira navegação instantânea.
function prefetchNavLinks() {
  // Espera o load completar pra não competir com recursos críticos.
  const run = () => {
    const seen = new Set();
    document.querySelectorAll('a[href$=".html"]').forEach(a => {
      const href = a.getAttribute("href");
      if (!href || href.startsWith("http") || seen.has(href)) return;
      seen.add(href);
      const link = document.createElement("link");
      link.rel = "prefetch";
      link.href = href;
      link.as = "document";
      document.head.appendChild(link);
    });
  };
  if (document.readyState === "complete") setTimeout(run, 50);
  else window.addEventListener("load", () => setTimeout(run, 50), { once: true });
}

// Hidrata o avatar do topbar + monta o botão de ajuda SYNC a partir do cache
// em sessionStorage, antes de qualquer await. Elimina o flicker "·" → "RF"
// na navegação entre páginas (mesma aba).
function groupProfileWithLogout() {
  const link = document.getElementById("topProfileLink");
  const btn  = document.getElementById("logoutBtn");
  if (!link || !btn) return;
  const parent = link.parentElement;
  if (!parent || btn.parentElement !== parent) return;
  if (parent.classList.contains("ep-profile-group")) return;
  if (link.parentElement?.classList?.contains("ep-profile-group")) return;

  const wrap = document.createElement("div");
  wrap.className = "ep-profile-group";
  parent.insertBefore(wrap, link);
  wrap.appendChild(link);
  wrap.appendChild(btn);
}

// Injeta toggle de tema (sol/lua) na topbar, à esquerda do perfil. Idempotente.
// Toggle de tema flutuante, empilhado acima do help bubble.
function mountThemeToggle() {
  if (typeof document === "undefined") return;
  if (document.getElementById("epThemeToggle")) return;
  const path = location.pathname.toLowerCase();
  if (path.endsWith("/2fa-verify.html")) return;

  const SUN = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"/></svg>';
  const MOON = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>';

  const btn = document.createElement("button");
  btn.id = "epThemeToggle";
  btn.type = "button";
  btn.className = "ep-theme-toggle";
  function paint() {
    const dark = getTheme() === "dark";
    btn.innerHTML = dark ? SUN : MOON;
    btn.setAttribute("aria-label", dark ? "Alternar para tema claro" : "Alternar para tema escuro");
    btn.setAttribute("title", dark ? "Tema claro" : "Tema escuro");
  }
  paint();
  btn.addEventListener("click", () => { toggleTheme(); paint(); });
  document.body.appendChild(btn);
}

(function hydrateChromeFromCache() {
  if (typeof document === "undefined") return;
  groupProfileWithLogout();
  mountThemeToggle();
  try {
    const raw = sessionStorage.getItem(PROFILE_CACHE_KEY);
    if (!raw) return;
    const entry = JSON.parse(raw);
    if (!entry?.profile?.therapist) return;
    applyTopUserSlot(entry.profile.therapist);
    mountHelpBubble();
  } catch { /* no-op */ }
})();

export async function requireTherapist({ requireDek = true } = {}) {
  const user = await authReady();
  if (!user) {
    window.location.href = "./login.html";
    throw new Error("NOT_AUTHENTICATED");
  }

  const idToken = await user.getIdToken();
  const profile = await fetchTherapistProfile(idToken, user.uid);

  if (!profile.ok) {
    if (profile.code === "NAO_REGISTRADO") {
      window.location.href = "./cadastro.html?step=profissional";
    } else {
      window.location.href = "./login.html?error=" + encodeURIComponent(profile.code);
    }
    throw new Error(profile.code);
  }

  // 2FA gate.
  if (profile.therapist?.twoFactorEnabled && !arguments[0]?.skip2fa) {
    if (!hasValid2faSession()) {
      const redirect = encodeURIComponent(location.pathname + location.search);
      window.location.href = "./2fa-verify.html?redirect=" + redirect;
      throw new Error("TWOFA_REQUIRED");
    }
  }

  // Aplica visibilidade baseada nas capabilities do conselho — esconde
  // links/botões pra features que o profissional não pode usar.
  applyCapabilityVisibility(profile.conselho?.capabilities);

  // Prefetch da nav pra navegação subsequente parecer instantânea.
  prefetchNavLinks();

  // Preenche o slot de perfil no topbar (avatar + nome → link pra perfil.html).
  applyTopUserSlot(profile.therapist);

  mountHelpBubble();

  if (requireDek) {
    const dek = recallDek();
    if (!dek) {
      window.location.href = "./login.html?reauth=1&redirect=" + encodeURIComponent(location.pathname + location.search);
      throw new Error("DEK_AUSENTE");
    }
    return { user, idToken, therapist: profile.therapist, conselho: profile.conselho, planAccess: profile.planAccess, dek };
  }

  return { user, idToken, therapist: profile.therapist, conselho: profile.conselho, planAccess: profile.planAccess };
}

export async function refreshIdToken() {
  if (!auth.currentUser) return null;
  return auth.currentUser.getIdToken(true);
}
