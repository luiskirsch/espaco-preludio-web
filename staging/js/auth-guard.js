// Espaço Prelúdio — guard de autenticação para páginas que exigem profissional logado.
// Uso:
//   import { requireTherapist } from "./js/auth-guard.js";
//   const { user, idToken, therapist } = await requireTherapist();

import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";
import { auth, BACKEND_BASE_URL } from "./firebase-config.js";
import { recallDek } from "./crypto.js";
import { mountThemeToggle } from "./theme-toggle.js";
import "./cmdk.js";

// ─── 2FA session ─────────────────────────────────────────────────────
// Token TOTP-session salvo em sessionStorage após verify. Validade = 8h
// (mesmo do access token). Limpo no logout.
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
// Tambem limpa sessao 2FA (TOTP em sessionStorage, validade 8h) — evita
// que outro usuario logando na mesma aba post-logout reuse o gate aprovado.
let lastSeenUid = null;
onAuthStateChanged(auth, (user) => {
  const uid = user?.uid || null;
  if (lastSeenUid && uid !== lastSeenUid) {
    invalidateProfileCache();
    clear2faSession();
  }
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
// Mostra/esconde links com [data-tiss-only] (link "TISS" no nav e congeneres).
// Default HTML eh display:none inline; quando habilitado, fica inline-block.
// Pareado com o preflight (que faz o mesmo pre-paint via cache).
function applyTissVisibility(therapist) {
  const enabled = !!therapist?.tissEnabled;
  document.querySelectorAll("[data-tiss-only]").forEach(el => {
    el.style.display = enabled ? "" : "none";
  });
}

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
  // Conta "não regulamentada" = sem nenhuma capability do conjunto regulado
  // acima. Toggla classe no <html> (mesma classe que o capability-preflight.js
  // aplica sincrono no head pre-paint). Aqui cobre o caso de SWR retornar
  // capabilities diferentes do cache — se cache era stale, ajusta sem reload.
  const isRegulated = RULES.some(r => set.has(r.capability));
  document.documentElement.classList.toggle("ep-unregulated", !isRegulated);
  // Re-aplica o estado do botão Sair com a regulação correta. Necessário
  // quando o IIFE inicial rodou antes do cache estar disponível ou com
  // cache stale — o botão fica no nav (estado grupo) e nunca vira FAB
  // depois que o profile fresco confirma que é regulado.
  mountLogoutFab();
}

// Botão flutuante de suporte — bubble vira chat ao vivo com Claude (Suporte 24/7).
// History persiste em sessionStorage durante a aba.
function mountHelpBubble() {
  if (typeof document === "undefined") return;
  const path = location.pathname.toLowerCase();
  if (path.endsWith("/2fa-verify.html")) return;
  if (document.getElementById("epHelpBubble")) return;

  // Bubble
  const a = document.createElement("button");
  a.id = "epHelpBubble";
  a.type = "button";
  a.className = "ep-help-bubble";
  a.title = "Aurora · suporte IA 24/7";
  a.setAttribute("aria-label", "Abrir Aurora — assistente IA");
  a.innerHTML = `
    <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="10"></circle>
      <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"></path>
      <line x1="12" y1="17" x2="12.01" y2="17"></line>
    </svg>
  `;
  document.body.appendChild(a);

  // Widget panel (oculto inicialmente)
  const panel = document.createElement("div");
  panel.id = "epSupportPanel";
  panel.style.cssText = `position: fixed; bottom: 100px; right: 24px; width: 360px; max-height: 520px; background: var(--ep-bg, #fff); border: 1px solid var(--ep-line, #ddd); border-radius: 12px; box-shadow: 0 8px 32px rgba(0,0,0,0.18); display: none; flex-direction: column; z-index: 9999; font-family: var(--ep-font-sans, system-ui);`;
  // Avatar SVG inline da Aurora — monograma "A" em serif sobre verde-pinheiro
  // com ponto dourado (alusão a aurora/amanhecer). Sem dependência externa.
  const AURORA_AVATAR = `<svg viewBox="0 0 64 64" width="36" height="36" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" style="flex-shrink:0;border-radius:50%;background:#f6f5f1;border:1.5px solid rgba(255,255,255,0.25);"><circle cx="32" cy="32" r="32" fill="#2d4a3e"/><text x="32" y="44" text-anchor="middle" font-family="Fraunces, Georgia, serif" font-size="34" font-weight="500" fill="#f6f5f1">A</text><circle cx="48" cy="18" r="3.5" fill="#c89b4a"/></svg>`;

  panel.innerHTML = `
    <div style="padding: 12px 16px; border-bottom: 1px solid var(--ep-line, #eee); display: flex; justify-content: space-between; align-items: center; background: var(--ep-accent, #2d4a3e); color: #fff; border-radius: 12px 12px 0 0; gap: 12px;">
      <div style="display:flex;align-items:center;gap:10px;">
        ${AURORA_AVATAR}
        <div>
          <div style="font-weight: 600; font-size: 14px;">Aurora <span style="opacity:0.65;font-weight:500;font-size:11px;">· IA 24/7</span></div>
          <div style="font-size: 11px; opacity: 0.85;">Assistente do Espaço Prelúdio</div>
        </div>
      </div>
      <button type="button" id="epSupportClose" style="background: transparent; border: 0; color: #fff; font-size: 22px; cursor: pointer; line-height: 1; padding: 0 4px;" aria-label="Fechar">×</button>
    </div>
    <div id="epSupportMsgs" style="flex: 1; overflow-y: auto; padding: 12px; display: flex; flex-direction: column; gap: 8px; min-height: 200px; max-height: 350px; font-size: 13px; line-height: 1.45; color: var(--ep-ink, #1c1f1d);"></div>
    <div style="padding: 10px 12px; border-top: 1px solid var(--ep-line, #eee); display: flex; gap: 6px;">
      <input id="epSupportInput" type="text" placeholder="Digite sua pergunta…" style="flex: 1; padding: 8px 10px; border: 1px solid var(--ep-line, #ddd); border-radius: 6px; font-size: 13px; background: var(--ep-bg, #fff); color: var(--ep-ink, #1c1f1d);">
      <button type="button" id="epSupportSend" style="padding: 8px 14px; background: var(--ep-accent, #2d4a3e); color: #fff; border: 0; border-radius: 6px; cursor: pointer; font-size: 13px; font-weight: 500;">↑</button>
    </div>
  `;
  document.body.appendChild(panel);

  const msgsEl = panel.querySelector("#epSupportMsgs");
  const inputEl = panel.querySelector("#epSupportInput");
  const sendBtn = panel.querySelector("#epSupportSend");
  const closeBtn = panel.querySelector("#epSupportClose");

  const HISTORY_KEY = "ep:support:history";
  let history = [];
  try { history = JSON.parse(sessionStorage.getItem(HISTORY_KEY) || "[]"); } catch {}

  function persistHistory() {
    try { sessionStorage.setItem(HISTORY_KEY, JSON.stringify(history.slice(-20))); } catch {}
  }
  function escSup(s) { return String(s||"").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[c])); }
  function renderHistory() {
    if (history.length === 0) {
      msgsEl.innerHTML = `<div style="text-align: center; color: var(--ep-ink-3, #888); padding: 20px; font-size: 12px; line-height: 1.5;">Oi, sou a <strong style="color:var(--ep-accent,#2d4a3e);">Aurora</strong>.<br>Me pergunte sobre features, fluxos ou troubleshooting da plataforma.</div>`;
      return;
    }
    msgsEl.innerHTML = history.map(m => {
      const mine = m.role === "user";
      return `<div style="align-self: ${mine ? "flex-end" : "flex-start"}; max-width: 85%; padding: 8px 12px; border-radius: 10px; background: ${mine ? "var(--ep-accent, #2d4a3e)" : "var(--ep-bg-2, #f3f1ea)"}; color: ${mine ? "#fff" : "var(--ep-ink, #1c1f1d)"}; white-space: pre-wrap; word-wrap: break-word;">${escSup(m.content)}</div>`;
    }).join("");
    msgsEl.scrollTop = msgsEl.scrollHeight;
  }
  renderHistory();

  async function sendQ() {
    const text = inputEl.value.trim();
    if (!text) return;
    inputEl.value = "";
    history.push({ role: "user", content: text });
    persistHistory();
    renderHistory();
    sendBtn.disabled = true;

    // Indicador "..."
    const thinking = document.createElement("div");
    thinking.style.cssText = `align-self: flex-start; padding: 8px 12px; border-radius: 10px; background: var(--ep-bg-2, #f3f1ea); color: var(--ep-ink-3, #888); font-size: 12px;`;
    thinking.textContent = "Pensando…";
    msgsEl.appendChild(thinking);
    msgsEl.scrollTop = msgsEl.scrollHeight;

    try {
      const user = auth.currentUser;
      const idToken = user ? await user.getIdToken() : null;
      const r = await fetch(`${BACKEND_BASE_URL}/therapy/support/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(idToken ? { "Authorization": `Bearer ${idToken}` } : {}) },
        body: JSON.stringify({ message: text, history: history.slice(0, -1) })
      });
      thinking.remove();
      const d = await r.json().catch(() => ({}));
      if (!r.ok || !d.ok) {
        const errMsg = r.status === 429 ? "Você atingiu o limite de 30 perguntas/dia. Reset em 24h." : ("Erro: " + (d?.error || r.status));
        history.push({ role: "assistant", content: errMsg });
      } else {
        history.push({ role: "assistant", content: d.reply });
      }
      persistHistory();
      renderHistory();
    } catch (e) {
      thinking.remove();
      history.push({ role: "assistant", content: "Erro de rede. Tente de novo." });
      persistHistory();
      renderHistory();
    } finally {
      sendBtn.disabled = false;
      inputEl.focus();
    }
  }

  a.addEventListener("click", () => {
    const open = panel.style.display === "flex";
    panel.style.display = open ? "none" : "flex";
    if (!open) setTimeout(() => inputEl.focus(), 50);
  });
  closeBtn.addEventListener("click", () => { panel.style.display = "none"; });
  sendBtn.addEventListener("click", sendQ);
  inputEl.addEventListener("keypress", (e) => { if (e.key === "Enter") sendQ(); });
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
    // Selo de verificado — só se status === "verified". Idempotente: remove
    // anteriores antes de adicionar. Garante avatar tenha class .ep-avatar-wrap.
    // O #topUserAvatar é o próprio span da imagem, então o badge fica como
    // filho dele com position:absolute.
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

// Helper exportado: cria HTML do selo (string) pra páginas usarem inline.
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

// Move o #logoutBtn pra fora do nav e transforma em FAB (botão flutuante
// no canto inferior direito, abaixo de help/msg/theme). Preserva o
// elemento original — assim cada página que registrou seu próprio
// onclick no #logoutBtn continua funcionando sem mudança.
//
// Comportamento unificado: SEMPRE vira FAB, independente da regulação
// do conselho. Antes ficava no nav pra contas SEM_CONSELHO; mas o nav
// continua apertado nesses casos (10+ links + perfil), então faz mais
// sentido manter o padrão consistente.
//
// Idempotente — se já moveu, no-op.
function mountLogoutFab() {
  const btn = document.getElementById("logoutBtn");
  if (!btn) return;
  if (btn.classList.contains("ep-logout-fab")) return;

  btn.className = "ep-logout-fab";
  btn.setAttribute("aria-label", "Sair");
  btn.title = "Sair";
  btn.innerHTML = `
    <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path>
      <polyline points="16 17 21 12 16 7"></polyline>
      <line x1="21" y1="12" x2="9" y2="12"></line>
    </svg>
  `;
  document.body.appendChild(btn);
}

// Agrupa o link do perfil com o botão Sair num único wrapper, virando
// uma "pill" composta na topbar. Usado apenas em contas nao-regulamentadas.
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

// mountThemeToggle: extraido para ./theme-toggle.js (re-export pra
// compat com codigo existente que importa daqui).
export { mountThemeToggle };

// Hidrata o avatar do topbar + monta o botão de ajuda SYNC a partir do cache
// em sessionStorage, antes de qualquer await. Elimina o flicker "·" → "RF"
// na navegação entre páginas (mesma aba). Sem cache (1ª visita) = no-op, e o
// requireTherapist aplica depois com dados frescos.
//
// Módulos ES são deferred — quando este IIFE roda, o DOM já está parseado e
// os elementos #topUserAvatar/#topUserName existem.
// Botão flutuante de mensagens — empilhado entre help (gold, em baixo) e
// theme toggle (em cima). Click vai pra mensagens.html, badge de unread
// no canto superior direito. Polling 60s.
function mountMessagesBubble(idTokenGetter) {
  if (typeof document === "undefined") return;
  if (document.getElementById("epMessagesBubble")) return;
  const path = location.pathname.toLowerCase();
  if (path.endsWith("/2fa-verify.html")) return;
  if (path.endsWith("/mensagens.html")) return; // não mostra na própria página

  const a = document.createElement("a");
  a.id = "epMessagesBubble";
  a.href = "./mensagens.html";
  a.className = "ep-msg-bubble-fab";
  a.title = "Mensagens";
  a.setAttribute("aria-label", "Abrir mensagens");
  a.innerHTML = `
    <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
    </svg>
    <span class="ep-msg-bubble-fab__badge ep-hide" aria-hidden="true">0</span>
  `;
  document.body.appendChild(a);
  const badge = a.querySelector(".ep-msg-bubble-fab__badge");

  async function refresh() {
    try {
      const token = await idTokenGetter();
      if (!token) return;
      const r = await fetch(`${BACKEND_BASE_URL}/therapy/chat/threads`, {
        headers: { "Authorization": `Bearer ${token}` }
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok || !d.ok) return;
      const unread = (d.threads || []).filter(t => t.hasUnread).length;
      if (unread > 0) {
        badge.textContent = unread > 99 ? "99+" : String(unread);
        badge.classList.remove("ep-hide");
      } else {
        badge.classList.add("ep-hide");
      }
    } catch {}
  }
  refresh();
  setInterval(refresh, 60_000);
}

(function hydrateChromeFromCache() {
  if (typeof document === "undefined") return;
  mountLogoutFab();
  mountThemeToggle();
  mountMessagesBubble(async () => {
    const u = auth.currentUser;
    return u ? u.getIdToken() : null;
  });
  try {
    const raw = sessionStorage.getItem(PROFILE_CACHE_KEY);
    if (!raw) return;
    const entry = JSON.parse(raw);
    if (!entry?.profile?.therapist) return;
    applyTopUserSlot(entry.profile.therapist);
    mountHelpBubble();
  } catch { /* no-op silencioso */ }
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

  // 2FA gate: se o profissional ativou 2FA, exige token válido em sessionStorage
  // pra liberar acesso. Sem token, redirect pra página de verificação. A própria
  // 2fa-verify.html pula este gate (skip2fa=true).
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
  // TISS opt-in: mostra/esconde links com [data-tiss-only] (link "TISS" no nav).
  applyTissVisibility(profile.therapist);

  // Prefetch da nav pra navegação subsequente parecer instantânea.
  prefetchNavLinks();

  // Preenche o slot de perfil no topbar (avatar + nome → link pra perfil.html).
  applyTopUserSlot(profile.therapist);

  // Botão flutuante de suporte (canto inferior direito).
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
