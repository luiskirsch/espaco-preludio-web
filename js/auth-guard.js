// Espaço Prelúdio — guard de autenticação para páginas que exigem profissional logado.
// Uso:
//   import { requireTherapist } from "./js/auth-guard.js";
//   const { user, idToken, therapist } = await requireTherapist();

import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";
import { auth, BACKEND_BASE_URL } from "./firebase-config.js";
import { recallDek } from "./crypto.js";
import { matchPatients, loadBookingDirectory, createSessionFromProposal, regeneratePatientLink, sanitizeProposal, proposalTimestamp, isValidEmail } from "./aurora-booking.js?v=3";
import { mountThemeToggle } from "./theme-toggle.js";
import "./cmdk.js";
import db from "./db.js";
import { connectRealtime } from "./realtime.js?v=1";

// ─── 2FA session ─────────────────────────────────────────────────────
// Token TOTP-session salvo em sessionStorage após verify. Validade = 8h
// (mesmo do access token). Limpo no logout.
const TWOFA_KEY = "ep:twofa-session";
const TWOFA_TTL_MS = 8 * 60 * 60 * 1000;

export function hasValid2faSession() {
  return !!get2faSessionToken();
}

export function get2faSessionToken() {
  try {
    const raw = sessionStorage.getItem(TWOFA_KEY);
    if (!raw) return "";
    const entry = JSON.parse(raw);
    if (!entry?.token || !entry?.savedAt) return "";
    if ((Date.now() - entry.savedAt) >= TWOFA_TTL_MS) {
      sessionStorage.removeItem(TWOFA_KEY);
      return "";
    }
    return String(entry.token);
  } catch { return ""; }
}
export function save2faSession(token) {
  try { sessionStorage.setItem(TWOFA_KEY, JSON.stringify({ token, savedAt: Date.now() })); } catch {}
}
export function clear2faSession() {
  try { sessionStorage.removeItem(TWOFA_KEY); } catch {}
}

// Acrescenta a prova de 2FA a toda chamada clínica feita por páginas que
// usam este guard. A validação real é do backend; sessionStorage é apenas o
// transporte do token opaco e não uma decisão de autorização do cliente.
// Centralizar aqui também evita que novas telas esqueçam o header.
const nativeFetch = globalThis.fetch.bind(globalThis);
let twofaRedirectStarted = false;

function isTherapyApiRequest(input) {
  try {
    const raw = typeof input === "string" || input instanceof URL ? input : input?.url;
    const url = new URL(raw, location.href);
    const backend = new URL(BACKEND_BASE_URL);
    return url.origin === backend.origin && url.pathname.startsWith("/therapy/");
  } catch {
    return false;
  }
}

async function therapyAuthenticatedFetch(input, init = {}) {
  if (!isTherapyApiRequest(input)) return nativeFetch(input, init);

  const requestHeaders = typeof Request !== "undefined" && input instanceof Request
    ? input.headers
    : undefined;
  const headers = new Headers(init.headers || requestHeaders || undefined);
  const twofaToken = get2faSessionToken();
  if (twofaToken && !headers.has("X-Therapy-2FA")) {
    headers.set("X-Therapy-2FA", twofaToken);
  }

  const response = await nativeFetch(input, { ...init, headers });
  if (response.status === 401 && !location.pathname.endsWith("/2fa-verify.html")) {
    const data = await response.clone().json().catch(() => ({}));
    if (data?.error === "TWOFA_REQUIRED" || data?.error === "TWOFA_SESSION_INVALID") {
      clear2faSession();
      if (!twofaRedirectStarted) {
        twofaRedirectStarted = true;
        const redirect = encodeURIComponent(location.pathname + location.search + location.hash);
        location.replace("./2fa-verify.html?redirect=" + redirect);
      }
    }
  }
  return response;
}

globalThis.fetch = therapyAuthenticatedFetch;

function redirectTo2faVerification() {
  clear2faSession();
  if (location.pathname.endsWith("/2fa-verify.html")) return;
  const redirect = encodeURIComponent(location.pathname + location.search + location.hash);
  location.replace("./2fa-verify.html?redirect=" + redirect);
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
const PROFILE_CACHE_KEY    = "ep:profile:v2";
const PROFILE_CACHE_TTL_MS = 30_000;
const PROFILE_IDB_TTL_MS   = 30 * 60_000;

async function readProfileCache(uid) {
  // 1. sessionStorage (quente, 30s).
  try {
    const raw = sessionStorage.getItem(PROFILE_CACHE_KEY);
    if (raw) {
      const entry = JSON.parse(raw);
      if (entry.uid === uid && Date.now() - entry.t <= PROFILE_CACHE_TTL_MS) return entry.profile;
    }
  } catch {}
  // 2. IndexedDB (morno, 30min — sobrevive ao fechar aba).
  try {
    const entry = await db.profile.get(uid);
    if (!entry) return null;
    if (Date.now() - entry.t > PROFILE_IDB_TTL_MS) return null;
    try { sessionStorage.setItem(PROFILE_CACHE_KEY, JSON.stringify({ uid, t: Date.now(), profile: entry.profile })); } catch {}
    return entry.profile;
  } catch { return null; }
}

function writeProfileCache(uid, profile) {
  try {
    sessionStorage.setItem(PROFILE_CACHE_KEY, JSON.stringify({ uid, t: Date.now(), profile }));
  } catch {}
  db.profile.put({ uid, t: Date.now(), profile }).catch(() => {});
  // Flag sync para sidebar.js: preflight TISS antes do primeiro auth async.
  try { localStorage.setItem("ep:tiss:enabled", profile?.therapist?.tissEnabled ? "1" : "0"); } catch {}
  try { localStorage.setItem("ep:programNetwork", profile?.therapist?.programNetwork ? "1" : "0"); } catch {}
}

export function invalidateProfileCache() {
  try {
    sessionStorage.removeItem(PROFILE_CACHE_KEY);
    sessionStorage.removeItem("ep:profile:v1");
  } catch {}
  try { localStorage.removeItem("ep:tiss:enabled"); } catch {}
  db.profile.clear().catch(() => {});
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

  const cached = await readProfileCache(uid);
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
        if (!!cached.therapist?.tissEnabled !== !!fresh.therapist?.tissEnabled) {
          applyTissVisibility(fresh.therapist);
        }
        if (!!cached.therapist?.programNetwork !== !!fresh.therapist?.programNetwork) {
          applyProgramNetworkVisibility(fresh.therapist);
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
  // Controla sidebar diretamente — não depende do MutationObserver/syncTiss
  const sideTiss = document.getElementById("sidebarTissLink");
  if (sideTiss) sideTiss.classList.toggle("is-hidden", !enabled);
}

// "Escolas" aparece só para quem está na rede dos programas (admin libera ou
// oculta no diretório de alunos e colaboradores).
function applyProgramNetworkVisibility(therapist) {
  const member = !!therapist?.programNetwork;
  const side = document.getElementById("sidebarSchoolsLink");
  if (side) side.classList.toggle("is-hidden", !member);
  document.querySelectorAll('a[href$="casos-publicos.html"]:not(#sidebarSchoolsLink)').forEach(el => {
    el.style.display = member ? "" : "none";
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

// Estilos do botão da Aurora — injetados aqui (dono do componente) pra não
// exigir bump do CSS global. Cores fixas em hex e sem var() na transição:
// padrão que evita o bug recorrente de ícone sumindo no hover dos FABs.
function injectAuroraFabStyle() {
  if (document.getElementById("ep-aurora-fab-style")) return;
  const style = document.createElement("style");
  style.id = "ep-aurora-fab-style";
  style.textContent = [
    ".ep-aurora-fab{position:fixed;right:16px;bottom:90px;width:52px;height:52px;border-radius:50%;border:2px solid #c89b4a;padding:0;background:#1c1f1d;display:block;overflow:hidden;cursor:pointer;box-shadow:0 4px 14px rgba(200,155,74,.30),0 1px 3px rgba(28,31,29,.10);transition:transform 160ms ease,box-shadow 160ms ease,border-color 160ms ease;z-index:180;}",
    ".ep-aurora-fab img{width:100%;height:100%;display:block;object-fit:cover;border-radius:50%;}",
    ".ep-aurora-fab:hover{transform:translateY(-2px) scale(1.04);border-color:#e2b76a;box-shadow:0 8px 22px rgba(200,155,74,.42),0 2px 4px rgba(28,31,29,.14);}",
    ".ep-aurora-fab:active{transform:translateY(0) scale(1);}",
    ".ep-aurora-fab:focus-visible{outline:2px solid #c89b4a;outline-offset:2px;}",
    ".ep-aurora-fab[aria-expanded=\"true\"]{border-color:#e2b76a;box-shadow:0 0 0 3px rgba(226,183,106,.35),0 8px 22px rgba(200,155,74,.42);}",
    "body:has(.ep-logout-fab) .ep-aurora-fab{bottom:156px;}",
    // Na coluna do desktop: logo acima do "?" (que passa pra ordem 8).
    ".ep-aurora-fab,body.ep-has-sidebar .ep-fab-stack>.ep-aurora-fab{order:7;}",
    ".ep-fab-stack>.ep-help-bubble,body.ep-has-sidebar .ep-fab-stack>.ep-help-bubble{order:8;}",
    "@media (min-width:900px){.ep-fab-stack>.ep-aurora-fab{position:relative!important;top:auto!important;right:auto!important;bottom:auto!important;margin:0!important;}}",
    // Fora da coluna (celular, ou páginas sem sidebar), cada botão tem altura
    // fixa: a Aurora ocupa a vaga acima do "?" e os de cima sobem uma posição.
    "@media (max-width:899px){body:has(.ep-aurora-fab) :is(.ep-msg-bubble-fab,.ep-theme-toggle,.ep-notif-fab){translate:0 -66px;}}",
    "body:has(.ep-aurora-fab) :is(.ep-msg-bubble-fab,.ep-theme-toggle,.ep-notif-fab):not(.ep-fab-stack > *){translate:0 -66px;}",
    "body.ep-consult .ep-aurora-fab{display:none!important;}",
    ".ep-aurora-typing{display:inline-flex;align-items:center;gap:7px;}",
    ".ep-aurora-typing__dots{display:inline-flex;align-items:center;gap:3px;height:10px;}",
    ".ep-aurora-typing__dots i{width:5px;height:5px;border-radius:50%;background:currentColor;opacity:.35;animation:ep-aurora-typing 1.2s ease-in-out infinite;}",
    ".ep-aurora-typing__dots i:nth-child(2){animation-delay:.15s;}",
    ".ep-aurora-typing__dots i:nth-child(3){animation-delay:.3s;}",
    "@keyframes ep-aurora-typing{0%,60%,100%{transform:translateY(0);opacity:.35}30%{transform:translateY(-3px);opacity:1}}",
    "@media (prefers-reduced-motion:reduce){.ep-aurora-typing__dots i{animation:none;opacity:.6;}}",
    "@media print{.ep-aurora-fab{display:none!important;}}",
    // Painel: no desktop ao lado da coluna de botões; no celular, largura toda.
    "@media (min-width:900px){#epSupportPanel{right:88px!important;bottom:24px!important;}}",
    "@media (max-width:899px){#epSupportPanel{left:8px!important;right:8px!important;width:auto!important;bottom:12px!important;}}"
  ].join("");
  document.head.appendChild(style);
}

// Aurora (chat IA 24/7) ganha botão próprio na coluna de botões flutuantes,
// logo acima do "?", que segue sendo a Central de Ajuda.
// History persiste em sessionStorage durante a aba.
function mountHelpBubble() {
  if (typeof document === "undefined") return;
  const path = location.pathname.toLowerCase();
  if (path.endsWith("/2fa-verify.html")) return;
  if (document.getElementById("epAuroraBubble")) return;

  injectAuroraFabStyle();
  const fabParent = document.querySelector(".ep-fab-stack") || document.body;

  if (!document.getElementById("epHelpBubble")) {
    const help = document.createElement("a");
    help.id = "epHelpBubble";
    help.className = "ep-help-bubble";
    help.href = "./suporte.html";
    help.title = "Suporte e ajuda";
    help.setAttribute("aria-label", "Abrir suporte");
    help.innerHTML = `<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"></circle><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"></path><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>`;
    fabParent.appendChild(help);
  }

  const a = document.createElement("button");
  a.id = "epAuroraBubble";
  a.type = "button";
  a.className = "ep-aurora-fab";
  a.title = "Aurora · assistente IA 24/7";
  a.setAttribute("aria-label", "Abrir Aurora — assistente IA");
  a.setAttribute("aria-expanded", "false");
  a.innerHTML = `<img src="/img/aurora-avatar.png" alt="" width="52" height="52" aria-hidden="true">`;
  fabParent.appendChild(a);

  // Widget panel (oculto inicialmente)
  const panel = document.createElement("div");
  panel.id = "epSupportPanel";
  panel.style.cssText = `position: fixed; bottom: 100px; right: 24px; width: 360px; max-height: 520px; background: var(--ep-bg, #fff); border: 1px solid var(--ep-line, #ddd); border-radius: 12px; box-shadow: 0 8px 32px rgba(0,0,0,0.18); display: none; flex-direction: column; z-index: 9999; font-family: var(--ep-font-sans, system-ui);`;
  const AURORA_AVATAR = `<img src="/img/aurora-avatar.png" alt="Aurora" width="36" height="36" aria-hidden="true" style="flex-shrink:0;border-radius:50%;object-fit:cover;border:1.5px solid rgba(255,255,255,0.25);">`;

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
  // A Aurora escreve [[Agenda]] pra levar o usuário a uma tela. Só nomes desta
  // lista viram link; o texto já chega escapado, então nada mais é interpretado.
  const SUP_PAGE_LINKS = {
    "Consultas": "./painel.html", "Agenda": "./agenda.html", "Pacientes": "./pacientes.html",
    "Financeiro": "./financeiro.html", "Relatórios": "./relatorios.html", "Clínica": "./clinica.html",
    "Estoque": "./inventario.html", "Receitas": "./receita.html", "Calculadora": "./calculadora.html",
    "TISS": "./tiss.html", "Suporte": "./suporte.html", "Perfil": "./perfil.html"
  };
  function linkSupPages(escaped) {
    return escaped.replace(/\[\[([^\[\]]{2,24})\]\]/g, (match, label) => {
      const href = SUP_PAGE_LINKS[label.trim()];
      return href
        ? `<a href="${href}" style="color: inherit; font-weight: 700; text-decoration: underline; text-underline-offset: 2px;">${label.trim()}</a>`
        : label;
    });
  }
  // Cartões de agendamento propostos pela Aurora. A proposta vem do backend;
  // paciente/e-mail são resolvidos aqui (cadastro cifrado) e a consulta só é
  // criada no clique em Confirmar.
  const bookingUi = new Map(); // "msg:ação" -> estado da interface do cartão
  let bookingDirectory = null;
  const supToken = async () => (auth.currentUser ? auth.currentUser.getIdToken() : null);
  function bookingDirectoryOnce() {
    if (!bookingDirectory) {
      bookingDirectory = loadBookingDirectory({ backendBaseUrl: BACKEND_BASE_URL, getToken: supToken })
        .catch(err => { bookingDirectory = null; throw err; });
    }
    return bookingDirectory;
  }
  const BOOKING_ERRORS = {
    HORARIO_PASSADO: "Esse horário já passou. Peça um novo horário à Aurora.",
    PLANO_INATIVO: "Seu plano não permite criar consultas agora. Veja no Perfil.",
    EMAIL_INVALIDO: "Informe um e-mail válido do paciente.",
    DATA_INVALIDA: "Data inválida. Peça de novo à Aurora.",
    PACIENTE_OBRIGATORIO: "Escolha o paciente."
  };
  const supCardStyle = "align-self: stretch; padding: 10px 12px; border: 1px solid var(--ep-line, #ddd); border-radius: 10px; background: var(--ep-bg, #fff); color: var(--ep-ink, #1c1f1d); font-size: 12.5px; line-height: 1.45; display: flex; flex-direction: column; gap: 7px;";
  const supFieldStyle = "padding: 6px 8px; border: 1px solid var(--ep-line, #ddd); border-radius: 6px; font-size: 12.5px; background: var(--ep-bg, #fff); color: var(--ep-ink, #1c1f1d); width: 100%; box-sizing: border-box;";
  const supLabelStyle = "display: flex; flex-direction: column; gap: 3px;";
  const supHintStyle = "color: var(--ep-ink-3, #888); font-size: 11px;";
  const supBtnStyle = (primary) => `padding: 6px 12px; border-radius: 6px; font-size: 12.5px; font-weight: 600; cursor: pointer; border: 1px solid ${primary ? "var(--ep-accent, #2d4a3e)" : "var(--ep-line, #ddd)"}; background: ${primary ? "var(--ep-accent, #2d4a3e)" : "transparent"}; color: ${primary ? "#fff" : "var(--ep-ink, #1c1f1d)"};`;

  function auroraPatientLink(codeOrToken) {
    const value = String(codeOrToken || "").trim();
    if (!value) return "";
    const param = value.length <= 16 ? "c" : "t";
    return `${location.origin}/entrar.html?${param}=${encodeURIComponent(value)}`;
  }

  function bookingCardHtml(mi, ai, action) {
    const id = `${mi}:${ai}`;
    const status = action.state?.status || "pending";
    const when = `${escSup(action.quando)}${action.duracaoMin ? ` · ${action.duracaoMin} min` : ""}`;
    if (status === "created") {
      const patientLink = auroraPatientLink(action.state.joinCodeOrToken);
      const linkStillValid = patientLink && (!action.state.joinTokenExp || Number(action.state.joinTokenExp) > Date.now());
      const linkBlock = linkStillValid
        ? `<a href="${escSup(patientLink)}" target="_blank" rel="noopener" style="color:var(--ep-accent,#2d4a3e);font-weight:700;text-decoration:underline;word-break:break-all;">Abrir link da consulta do paciente</a><button type="button" data-sup-act="copy-link" data-sup-id="${id}" style="${supBtnStyle(false)}">Copiar link</button>`
        : `<button type="button" data-sup-act="generate-link" data-sup-id="${id}" style="${supBtnStyle(true)}">${patientLink ? "Gerar novo link" : "Gerar link da consulta"}</button><span>Você também pode gerar em ${linkSupPages("[[Agenda]]")}, clicando na consulta e em “Copiar link”.</span>`;
      return `<div style="${supCardStyle}"><strong>✓ Consulta agendada pela Aurora</strong><span>${escSup(action.state.name)} · ${escSup(action.quando)}</span>${linkBlock}<span style="${supHintStyle}">Este é o link de acesso do paciente. Não o publique.</span></div>`;
    }
    if (status === "dismissed") {
      return `<div style="${supCardStyle} opacity: .7;"><span>Agendamento descartado.</span></div>`;
    }
    const ui = bookingUi.get(id) || { loading: true };
    const conflicts = action.conflitos?.length
      ? `<span style="color: #b45309;">Atenção: já há consulta nesse horário — ${action.conflitos.map(c => `${escSup(c.paciente)} (${escSup(c.quando)})`).join(", ")}.</span>`
      : "";
    let body;
    if (ui.loading) {
      body = `<span style="${supHintStyle}">Procurando “${escSup(action.paciente)}” nos seus pacientes…</span>`;
    } else if (ui.loadError) {
      body = `<span>Não consegui carregar seus pacientes agora.</span><div><button type="button" data-sup-act="retry" data-sup-id="${id}" style="${supBtnStyle(false)}">Tentar de novo</button></div>`;
    } else if (!ui.candidates.length) {
      body = `<span>Não encontrei “${escSup(action.paciente)}” entre seus pacientes${ui.hasDek ? "" : " (a lista cifrada não está desbloqueada nesta aba)"}. Cadastre em ${linkSupPages("[[Pacientes]]")} e me peça de novo.</span><div><button type="button" data-sup-act="dismiss" data-sup-id="${id}" style="${supBtnStyle(false)}">Fechar</button></div>`;
    } else {
      const only = ui.candidates.length === 1 ? ui.candidates[0] : null;
      const sourceTag = c => (c.source !== "cadastro" ? ` (${escSup(c.source)})` : "");
      const patientField = only
        ? `<strong>${escSup(only.name)}<span style="font-weight: 400; ${supHintStyle}">${sourceTag(only)}</span></strong>`
        : `<select data-sup-field="patient" data-sup-id="${id}" style="${supFieldStyle}">${ui.candidates.map(c => `<option value="${escSup(c.key)}"${c.key === ui.selectedKey ? " selected" : ""}>${escSup(c.name)}${sourceTag(c)}</option>`).join("")}</select>`;
      body = `
        <label style="${supLabelStyle}"><span style="${supHintStyle}">Paciente${only ? "" : ` — ${ui.candidates.length} encontrados, escolha`}</span>${patientField}</label>
        <label style="${supLabelStyle}"><span style="${supHintStyle}">E-mail do paciente (confirmação e lembrete)</span><input type="email" data-sup-field="email" data-sup-id="${id}" value="${escSup(ui.email || "")}" placeholder="email@exemplo.com" style="${supFieldStyle}"></label>
        ${ui.error ? `<span style="color: #b91c1c;">${escSup(ui.error)}</span>` : ""}
        <div style="display: flex; gap: 6px;"><button type="button" data-sup-act="confirm" data-sup-id="${id}" style="${supBtnStyle(true)}"${ui.busy ? " disabled" : ""}>${ui.busy ? "Agendando…" : "Confirmar"}</button><button type="button" data-sup-act="dismiss" data-sup-id="${id}" style="${supBtnStyle(false)}"${ui.busy ? " disabled" : ""}>Cancelar</button></div>`;
    }
    return `<div style="${supCardStyle}" data-sup-card="${id}"><strong>Nova consulta</strong><span>${when}</span>${conflicts}${body}</div>`;
  }

  function resolveBookingCards() {
    history.forEach((m, mi) => (m.actions || []).forEach((action, ai) => {
      const id = `${mi}:${ai}`;
      if ((action.state?.status || "pending") !== "pending" || bookingUi.has(id)) return;
      bookingUi.set(id, { loading: true });
      bookingDirectoryOnce()
        .then(dir => {
          const candidates = matchPatients(action.paciente, dir.entries);
          bookingUi.set(id, { candidates, hasDek: dir.hasDek, selectedKey: candidates[0]?.key || null, email: candidates[0]?.email || "" });
        })
        .catch(() => bookingUi.set(id, { loadError: true }))
        .finally(renderHistory);
    }));
  }

  msgsEl.addEventListener("input", (e) => {
    const el = e.target.closest('[data-sup-field="email"]');
    const ui = el && bookingUi.get(el.dataset.supId);
    if (ui) ui.email = el.value;
  });
  msgsEl.addEventListener("change", (e) => {
    const el = e.target.closest('[data-sup-field="patient"]');
    const ui = el && bookingUi.get(el.dataset.supId);
    if (!ui) return;
    ui.selectedKey = el.value;
    ui.email = ui.candidates.find(c => c.key === el.value)?.email || "";
    renderHistory();
  });
  msgsEl.addEventListener("click", async (e) => {
    const btn = e.target.closest("[data-sup-act]");
    if (!btn) return;
    const id = btn.dataset.supId;
    const [mi, ai] = id.split(":").map(Number);
    const action = history[mi]?.actions?.[ai];
    if (!action) return;
    const act = btn.dataset.supAct;
    if (act === "generate-link") {
      const original = btn.textContent;
      btn.disabled = true;
      btn.textContent = "Gerando…";
      try {
        let sessionId = action.state?.sessionId || "";
        // Compatibilidade com cartões confirmados antes de o sessionId passar
        // a ser salvo no histórico: localiza pela combinação paciente + horário.
        if (!sessionId) {
          const token = await supToken();
          const sessionsRes = await fetch(`${BACKEND_BASE_URL}/therapy/sessoes?includeHidden=true`, { headers: { Authorization: `Bearer ${token}` } });
          const sessionsData = await sessionsRes.json().catch(() => ({}));
          const targetAt = proposalTimestamp(action);
          const matches = (Array.isArray(sessionsData.sessions) ? sessionsData.sessions : []).filter(s =>
            s.patientName === action.state?.name && Number(s.scheduledAt) === targetAt && s.status !== "completed" && s.status !== "canceled"
          );
          if (matches.length !== 1) throw new Error("SESSAO_NAO_ENCONTRADA");
          sessionId = matches[0].sessionId;
        }
        const result = await regeneratePatientLink({ backendBaseUrl: BACKEND_BASE_URL, getToken: supToken, sessionId });
        if (!result.ok || !result.joinCodeOrToken) throw new Error(result.error || "LINK_INDISPONIVEL");
        action.state = { ...action.state, sessionId, joinCodeOrToken: result.joinCodeOrToken, joinTokenExp: result.joinTokenExp };
        persistHistory();
        renderHistory();
      } catch {
        btn.textContent = "Não foi possível gerar";
        btn.disabled = false;
        setTimeout(() => { btn.textContent = original; }, 2000);
      }
      return;
    }
    if (act === "copy-link") {
      const link = auroraPatientLink(action.state?.joinCodeOrToken);
      if (!link) return;
      const original = btn.textContent;
      try {
        await navigator.clipboard.writeText(link);
        btn.textContent = "Copiado!";
      } catch {
        btn.textContent = "Abra o link acima";
      }
      setTimeout(() => { btn.textContent = original; }, 1600);
      return;
    }
    if (act === "retry") { bookingUi.delete(id); renderHistory(); return; }
    if (act === "dismiss") { action.state = { status: "dismissed" }; persistHistory(); renderHistory(); return; }
    if (act !== "confirm") return;
    const ui = bookingUi.get(id);
    if (!ui || ui.busy || !ui.candidates?.length) return;
    const patient = ui.candidates.find(c => c.key === ui.selectedKey) || ui.candidates[0];
    if (!isValidEmail(ui.email)) { ui.error = BOOKING_ERRORS.EMAIL_INVALIDO; renderHistory(); return; }
    ui.busy = true;
    ui.error = "";
    renderHistory();
    const result = await createSessionFromProposal({ backendBaseUrl: BACKEND_BASE_URL, getToken: supToken, proposal: action, patient, email: ui.email })
      .catch(err => ({ ok: false, error: err.message }));
    ui.busy = false;
    if (!result.ok) {
      ui.error = BOOKING_ERRORS[result.error] || `Não foi possível agendar (${result.error}).`;
      renderHistory();
      return;
    }
    action.state = { status: "created", name: patient.name, sessionId: result.sessionId, joinCodeOrToken: result.joinCodeOrToken, joinTokenExp: result.joinTokenExp };
    // Nota só pro contexto da Aurora (vai no histórico); o cartão já mostra.
    history.push({ role: "assistant", content: `Consulta agendada por meio do cartão da Aurora: ${patient.name}, ${action.quando}. O link do paciente está disponível no cartão e também pode ser gerado em Agenda, clicando na consulta e em Copiar link.`, silent: true });
    bookingDirectory = null;
    persistHistory();
    renderHistory();
  });

  function renderHistory() {
    if (history.length === 0) {
      msgsEl.innerHTML = `<div style="text-align: center; color: var(--ep-ink-3, #888); padding: 20px; font-size: 12px; line-height: 1.5;">Oi, sou a <strong style="color:var(--ep-accent,#2d4a3e);">Aurora</strong>.<br>Posso consultar sua agenda, pendências da conta e novidades da plataforma, além de tirar dúvidas de uso.</div>`;
      return;
    }
    msgsEl.innerHTML = history.map((m, mi) => {
      if (m.silent) return "";
      const mine = m.role === "user";
      const bubble = `<div style="align-self: ${mine ? "flex-end" : "flex-start"}; max-width: 85%; padding: 8px 12px; border-radius: 10px; background: ${mine ? "var(--ep-accent, #2d4a3e)" : "var(--ep-bg-2, #f3f1ea)"}; color: ${mine ? "#fff" : "var(--ep-ink, #1c1f1d)"}; white-space: pre-wrap; word-wrap: break-word;">${mine ? escSup(m.content) : linkSupPages(escSup(m.content))}</div>`;
      const cards = !mine && Array.isArray(m.actions) ? m.actions.map((action, ai) => bookingCardHtml(mi, ai, action)).join("") : "";
      return bubble + cards;
    }).join("");
    msgsEl.scrollTop = msgsEl.scrollHeight;
    resolveBookingCards();
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

    // Indicador de digitação: texto + três pontos animados
    const thinking = document.createElement("div");
    thinking.className = "ep-aurora-typing";
    thinking.setAttribute("role", "status");
    thinking.style.cssText = `align-self: flex-start; padding: 8px 12px; border-radius: 10px; background: var(--ep-bg-2, #f3f1ea); color: var(--ep-ink-3, #888); font-size: 12px;`;
    thinking.innerHTML = `<span>Aurora está digitando</span><span class="ep-aurora-typing__dots" aria-hidden="true"><i></i><i></i><i></i></span>`;
    msgsEl.appendChild(thinking);
    msgsEl.scrollTop = msgsEl.scrollHeight;

    try {
      const user = auth.currentUser;
      const idToken = user ? await user.getIdToken() : null;
      const r = await fetch(`${BACKEND_BASE_URL}/therapy/support/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(idToken ? { "Authorization": `Bearer ${idToken}` } : {}) },
        body: JSON.stringify({
          message: text,
          history: history.slice(0, -1).map(m => ({ role: m.role, content: m.content })),
          page: location.pathname,
          timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
          locale: document.documentElement.lang || "pt-BR"
        })
      });
      thinking.remove();
      const d = await r.json().catch(() => ({}));
      if (!r.ok || !d.ok) {
        const errMsg = r.status === 429 ? "Você atingiu o limite de 30 perguntas/dia. Reset em 24h." : ("Erro: " + (d?.error || r.status));
        history.push({ role: "assistant", content: errMsg });
      } else {
        const actions = (Array.isArray(d.actions) ? d.actions : []).map(sanitizeProposal).filter(Boolean).slice(0, 3);
        history.push({ role: "assistant", content: d.reply, ...(actions.length ? { actions } : {}) });
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
    a.setAttribute("aria-expanded", open ? "false" : "true");
    if (!open) setTimeout(() => inputEl.focus(), 50);
  });
  closeBtn.addEventListener("click", () => {
    panel.style.display = "none";
    a.setAttribute("aria-expanded", "false");
  });
  sendBtn.addEventListener("click", sendQ);
  inputEl.addEventListener("keypress", (e) => { if (e.key === "Enter") sendQ(); });
}

// Preenche os slots de perfil do topbar e da sidebar. Algumas páginas
// operacionais (como Escolas) não possuem topbar visível; por isso a sidebar
// precisa receber os dados diretamente, sem depender do espelhamento do topo.
//
// Foto: vem como data URL construída a partir de therapist.photoBase64 +
// therapist.photoMime (armazenamento inline no Firestore). Fallback pra
// iniciais quando não tem foto.
export function applyTopUserSlot(therapist) {
  const name = (therapist?.displayName || "").trim();
  const elName   = document.getElementById("topUserName");
  const elAvatar = document.getElementById("topUserAvatar");
  if (elName) elName.textContent = name || "Perfil";
  const sidebarName = document.getElementById("sidebarUserName");
  if (sidebarName) {
    const parts = (name || "Perfil").split(/\s+/).filter(Boolean);
    const visibleParts = parts.length > 1 ? [parts[0], parts[parts.length - 1]] : [parts[0]];
    sidebarName.replaceChildren(...visibleParts.map(part => {
      const span = document.createElement("span");
      span.textContent = part;
      return span;
    }));
  }
  const avatars = [elAvatar, document.getElementById("sidebarUserAvatar")].filter(Boolean);
  avatars.forEach(avatar => {
    const photoBase64 = String(therapist?.photoBase64 || "");
    const requestedMime = String(therapist?.photoMime || "image/jpeg");
    const photoMime = /^(?:image\/)(?:jpeg|png|webp|gif)$/i.test(requestedMime) ? requestedMime : "image/jpeg";
    const safePhoto = photoBase64.length <= 1_500_000 && /^[A-Za-z0-9+/]+={0,2}$/.test(photoBase64);
    if (safePhoto) {
      avatar.style.backgroundImage = `url(data:${photoMime};base64,${photoBase64})`;
      avatar.style.backgroundSize = "cover";
      avatar.style.backgroundPosition = "center";
      avatar.textContent = "";
    } else {
      avatar.style.backgroundImage = "";
      const initials = (name.match(/\b\p{L}/gu) || []).slice(0, 2).join("").toUpperCase() || "·";
      avatar.textContent = initials;
    }
    // Selo de verificado — só se status === "verified". Idempotente: remove
    // anteriores antes de adicionar. Garante avatar tenha class .ep-avatar-wrap.
    // O #topUserAvatar é o próprio span da imagem, então o badge fica como
    // filho dele com position:absolute.
    avatar.classList.add("ep-avatar-wrap");
    const old = avatar.querySelector(".ep-verified-badge");
    if (old) old.remove();
    if (therapist?.verificationStatus === "verified") {
      const badge = document.createElement("span");
      badge.className = "ep-verified-badge";
      badge.setAttribute("title", "Profissional verificado · inscrição no conselho confirmada");
      badge.setAttribute("aria-label", "Profissional verificado");
      badge.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 12l5 5L20 7" stroke-linecap="round" stroke-linejoin="round"/></svg>';
      avatar.appendChild(badge);
    }
  });
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

// Hover-prefetch de DADOS — vai além do prefetch de HTML. Quando o usuário
// passa o mouse sobre um link da sidebar/nav e fica >120ms (debounce evita
// disparar pra todos os links no swipe), faz fetch das APIs principais da
// página destino e grava no MESMO sessionStorage cache (api-cache.js).
// Quando a página alvo abre e chama cachedGet(), pega o cache fresco —
// pula o "Carregando…" inteiramente, render direto com dados.
//
// Mapping é estático (rota → endpoints+keys). Falha silenciosa.
const NAV_DATA_PREFETCH = {
  "painel.html": [
    { url: "/therapy/sessoes",        key: "sessoes" },
  ],
  "agenda.html": [
    { url: "/therapy/sessoes?includeHidden=true", key: "sessoes:all" },
    { url: "/therapy/agenda/blackouts",  key: "blackouts" },
    { url: "/therapy/agenda/notes",      key: "agendaNotes" },
  ],
  "pacientes.html": [
    { url: "/therapy/pacientes",      key: "pacientes" },
  ],
  "clinica.html": [
    { url: "/therapy/clinicas/state", key: "clinicas:state", ttl: 30_000 },
  ],
  "marketing.html": [
    { url: "/therapy/marketing/audiences", key: "marketing:audiences", ttl: 5 * 60_000 },
  ],
};
const NS_API_CACHE = "ep:api:v1:";
function setupHoverDataPrefetch(uid) {
  if (!uid) return;
  const seenSessionPrefetches = new Set();
  let hoverTimer = null;

  function prefetchRoute(href) {
    // basename da href: "./pacientes.html" → "pacientes.html"
    const name = (href || "").replace(/^\.?\//, "").split("?")[0].toLowerCase();
    const targets = NAV_DATA_PREFETCH[name];
    if (!targets) return;
    if (seenSessionPrefetches.has(name)) return; // já feito nesta sessão de hover

    targets.forEach(async ({ url, key, ttl }) => {
      const cacheTtl = ttl || 30_000;
      const cacheKey = NS_API_CACHE + key + ":" + uid;
      // Pula se já tem cache fresco (api-cache.js gerencia TTL).
      try {
        const raw = sessionStorage.getItem(cacheKey);
        if (raw) {
          const entry = JSON.parse(raw);
          if (Date.now() - entry.t < (entry.ttl || cacheTtl)) return; // ainda válido
        }
      } catch {}
      try {
        const user = auth.currentUser;
        if (!user) return;
        const token = await user.getIdToken();
        const res = await fetch(BACKEND_BASE_URL + url, {
          headers: { "Authorization": `Bearer ${token}` }
        });
        if (!res.ok) return;
        const data = await res.json();
        if (!data?.ok) return;
        sessionStorage.setItem(cacheKey, JSON.stringify({
          t: Date.now(), ttl: cacheTtl, data
        }));
      } catch { /* silencioso */ }
    });
    seenSessionPrefetches.add(name);
  }

  function onHoverStart(e) {
    const a = e.target.closest('a[href$=".html"]');
    if (!a) return;
    const href = a.getAttribute("href");
    if (!href || href.startsWith("http")) return;
    clearTimeout(hoverTimer);
    hoverTimer = setTimeout(() => prefetchRoute(href), 120);
  }
  function onHoverEnd() { clearTimeout(hoverTimer); }

  document.addEventListener("mouseover", onHoverStart, { passive: true });
  document.addEventListener("mouseout",  onHoverEnd,   { passive: true });
  // Touch — dispara imediato no touchstart (usuário já decidiu).
  document.addEventListener("touchstart", (e) => {
    const a = e.target.closest('a[href$=".html"]');
    if (a) prefetchRoute(a.getAttribute("href"));
  }, { passive: true });
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
// FABs de ferramentas clínicas — montados só para quem tem a capability.
function mountCapabilityFabs(capabilities) {
  if (typeof document === "undefined") return;
  const set = new Set(capabilities || []);
  const FABS = [
    {
      id: "epReceitaFab",
      cls: "ep-receita-fab",
      href: "./receita.html",
      label: "Emitir receita",
      cap: "receita",
      svg: '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 12h6m-3-3v6"/><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>'
    },
    {
      id: "epAtestadoFab",
      cls: "ep-atestado-fab",
      href: "./documento.html?tipo=atestado",
      label: "Emitir atestado",
      cap: "documentos-clinicos",
      svg: '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><polyline points="9 15 11 17 15 13"/></svg>'
    },
    {
      id: "epCalcFab",
      cls: "ep-calc-fab",
      href: "./calculadora.html",
      label: "Calculadora clínica",
      cap: "calculadora-clinica",
      svg: '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="4" y="2" width="16" height="20" rx="2"/><line x1="8" y1="6" x2="16" y2="6"/><line x1="8" y1="11" x2="8" y2="11"/><line x1="12" y1="11" x2="12" y2="11"/><line x1="16" y1="11" x2="16" y2="11"/><line x1="8" y1="15" x2="8" y2="15"/><line x1="12" y1="15" x2="12" y2="15"/><line x1="16" y1="15" x2="16" y2="15"/><line x1="8" y1="19" x2="12" y2="19"/></svg>'
    }
  ];
  FABS.forEach(({ id, cls, href, label, cap, svg }) => {
    if (!set.has(cap)) return;
    if (document.getElementById(id)) return;
    const a = document.createElement("a");
    a.id = id;
    a.href = href;
    a.className = cls;
    a.title = label;
    a.setAttribute("aria-label", label);
    a.innerHTML = svg;
    document.body.appendChild(a);
  });
}

// Módulos ES são deferred — quando este IIFE roda, o DOM já está parseado e
// os elementos #topUserAvatar/#topUserName existem.
// Botão flutuante de mensagens — empilhado entre help (gold, em baixo) e
// theme toggle (em cima). Abre o Chat com escolha entre colegas e pacientes; badge de unread
// no canto superior direito. Polling 60s.
function mountMessagesBubble(idTokenGetter) {
  if (typeof document === "undefined") return;
  if (document.getElementById("epMessagesBubble")) return;
  const path = location.pathname.toLowerCase();
  if (path.endsWith("/2fa-verify.html")) return;
  if (path.endsWith("/mensagens.html") || path.endsWith("/mensagens-pro.html")) return; // não mostra dentro do Chat

  const a = document.createElement("a");
  a.id = "epMessagesBubble";
  a.href = "./mensagens-pro.html";
  a.className = "ep-msg-bubble-fab";
  a.title = "Abrir Chat";
  a.setAttribute("aria-label", "Abrir Chat");
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

function mountNotifBadge(idTokenGetter) {
  if (typeof document === "undefined") return;

  async function refresh() {
    try {
      const token = await idTokenGetter();
      if (!token) return;
      const r = await fetch(`${BACKEND_BASE_URL}/therapy/notificacoes?onlyUnread=true&limit=50`, {
        headers: { "Authorization": `Bearer ${token}` }
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok || !d.ok) return;
      const count = d.unreadCount || 0;
      // Aguarda sidebar.js injetar o badge (pode ainda não estar pronto)
      const trySet = () => {
        if (window.EPSidebar?.setBadge) { window.EPSidebar.setBadge(count); }
        else { setTimeout(trySet, 300); }
      };
      trySet();
    } catch {}
  }
  refresh();
  setInterval(refresh, 60_000);
}

(function hydrateChromeFromCache() {
  if (typeof document === "undefined") return;
  mountLogoutFab();
  mountThemeToggle();
  const tokenGetter = async () => { const u = auth.currentUser; return u ? u.getIdToken() : null; };
  mountMessagesBubble(tokenGetter);
  mountNotifBadge(tokenGetter);
  let hydratedSync = false;
  try {
    const raw = sessionStorage.getItem(PROFILE_CACHE_KEY);
    if (raw) {
      const entry = JSON.parse(raw);
      if (entry?.profile?.therapist) {
        applyTopUserSlot(entry.profile.therapist);
        mountHelpBubble();
        hydratedSync = true;
      }
    }
  } catch {}
  if (!hydratedSync) {
    // Novo tab / reabriu: sessionStorage vazio, mas IDB tem o profile (~1-5ms).
    authReady().then(user => {
      if (!user) return;
      return db.profile.get(user.uid).then(entry => {
        if (entry?.profile?.therapist) {
          applyTopUserSlot(entry.profile.therapist);
          mountHelpBubble();
        }
      });
    }).catch(() => {});
  }
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
    if (profile.code === "TWOFA_REQUIRED" || profile.code === "TWOFA_SESSION_INVALID") {
      redirectTo2faVerification();
    } else if (profile.code === "NAO_REGISTRADO") {
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
  // FABs de ferramentas clínicas (receita, atestado, calculadora).
  mountCapabilityFabs(profile.conselho?.capabilities);
  // TISS opt-in: mostra/esconde links com [data-tiss-only] (link "TISS" no nav).
  applyTissVisibility(profile.therapist);
  applyProgramNetworkVisibility(profile.therapist);

  // Prefetch da nav pra navegação subsequente parecer instantânea.
  prefetchNavLinks();
  // Hover-prefetch de dados — quando o user passa o mouse num link da
  // sidebar por >120ms, dispara as APIs da página destino em background.
  // Resultado: ao clicar, a página alvo já vê o cache fresco e pula o
  // "Carregando…" inteiramente.
  setupHoverDataPrefetch(user.uid);

  // Preenche o slot de perfil no topbar (avatar + nome → link pra perfil.html).
  applyTopUserSlot(profile.therapist);

  // Botão flutuante de suporte (canto inferior direito).
  mountHelpBubble();

  // Badge do sino de notificações — busca contador real ao carregar a
  // página. Sem isso, o sino só zera (ao abrir notificacoes.html) mas
  // nunca mostra o número de não-lidas (ex.: nova solicitação de agendamento).
  fetch(`${BACKEND_BASE_URL}/therapy/notifications/unread-count`, {
    headers: { "Authorization": `Bearer ${idToken}` }
  }).then(r => r.json()).then(d => {
    if (d?.ok && window.EP_NOTIF) window.EP_NOTIF.setBadge(d.count || 0);
  }).catch(() => { /* badge é melhoria, não bloqueia carregamento */ });

  // Realtime: conecta Socket.io (singleton — seguro chamar N vezes).
  connectRealtime(user.uid, idToken).catch(() => {});

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
