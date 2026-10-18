// Espaço Prelúdio — Firebase + Backend config com detecções automáticas:
//
// (1) Ambiente (staging vs production) — por path:
//     /staging/* → STAGING (Firebase sextolugar-staging + backend staging)
//     resto      → PRODUCTION (Firebase osextolugar-game + backend production)
//
// (2) Perfil (paciente/aluno, instituição ou profissional) — por path:
//     /paciente-*, /aluno-* ou /entrar.html → app isolado "patient"
//     /instituicao-*                         → app isolado "institution"
//     resto                                  → PROFISSIONAL (app "[DEFAULT]")
//
// Isso evita que perfis diferentes compartilhem a MESMA
// instancia Firebase Auth, e login do paciente em outra aba derruba a
// sessao do profissional (e vice-versa) — onAuthStateChanged dispara
// pra todas as abas da mesma origem que compartilham a app.
//
// Cada Firebase app tem nome diferente => persistencia IndexedDB
// namespaced separadamente => 2 sessoes independentes no mesmo browser.

import { initializeApp, getApps, getApp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
import { getAuth, initializeAuth, indexedDBLocalPersistence, browserLocalPersistence, browserSessionPersistence }
  from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";
import { isRtAuthContext, installClinicalFetch } from "./twofa-session.js?v=20261018-mfa4";

// ─── Detecções ─────────────────────────────────────────────────────────
const _path = typeof location !== "undefined" ? location.pathname : "";
const IS_STAGING = _path.startsWith("/staging/");
const IS_PATIENT_PAGE =
  _path.includes("/paciente-") ||
  _path.includes("/aluno-") ||
  _path.endsWith("/entrar.html");
const IS_INSTITUTION_PAGE = _path.includes("/instituicao-");
const IS_RT_PAGE = isRtAuthContext(_path, typeof location !== "undefined" ? location.search : "");

// ─── Configs por ambiente ─────────────────────────────────────────────────
const STAGING_FIREBASE = {
  apiKey: "AIzaSyAflOnCIpF6NYCxdd23XSZTLK2V54XLGFU",
  authDomain: "sextolugar-staging.firebaseapp.com",
  projectId: "sextolugar-staging",
  storageBucket: "sextolugar-staging.firebasestorage.app",
  messagingSenderId: "407627003441",
  appId: "1:407627003441:web:c501d2d46f04f40cd7c710",
  measurementId: "G-WRYDRCC4GV"
};

const PRODUCTION_FIREBASE = {
  apiKey: "AIzaSyC8sSvA7_1HPYRFGFgdgzstkP_yQHadY-c",
  authDomain: "osextolugar-game.firebaseapp.com",
  projectId: "osextolugar-game",
  storageBucket: "osextolugar-game.firebasestorage.app",
  messagingSenderId: "947922328721",
  appId: "1:947922328721:web:989522c99e16ab449f3330"
};

export const firebaseConfig = IS_STAGING ? STAGING_FIREBASE : PRODUCTION_FIREBASE;

// Backend URL — default = Railway (staging ou prod).
// Override APENAS em staging: ?backend=URL ou localStorage 'ep_backend_url_override'.
// Em produção o override está DESABILITADO — qualquer URL arbitrária seria
// phishing: link com ?backend=servidor-atacante recebe o Firebase ID token do prof.
function _detectBackendOverride() {
  if (typeof window === "undefined") return null;
  if (!IS_STAGING) {
    // Limpa qualquer override que possa ter ficado no localStorage de sessões anteriores
    try { localStorage.removeItem("ep_backend_url_override"); } catch (_) {}
    return null;
  }
  const normalizeOverride = (value) => {
    try {
      const url = new URL(String(value || ""));
      const localHost = url.hostname === "localhost" || url.hostname === "127.0.0.1" || url.hostname === "[::1]";
      const officialStaging = ["https://api-staging.espacopreludio.com.br", "https://osl-video-server-staging.up.railway.app"].includes(url.origin);
      if (url.username || url.password || (url.protocol !== "https:" && !(localHost && url.protocol === "http:"))) return null;
      if (!localHost && !officialStaging) return null;
      return url.origin;
    } catch {
      return null;
    }
  };
  try {
    const qs = new URLSearchParams(location.search).get("backend");
    if (qs) {
      const safe = normalizeOverride(qs);
      if (!safe) {
        try { localStorage.removeItem("ep_backend_url_override"); } catch (_) {}
        return null;
      }
      try { localStorage.setItem("ep_backend_url_override", safe); } catch (_) {}
      return safe;
    }
    const ls = localStorage.getItem("ep_backend_url_override");
    if (ls) {
      const safe = normalizeOverride(ls);
      if (safe) return safe;
      localStorage.removeItem("ep_backend_url_override");
    }
  } catch (_) { /* localStorage indisponivel */ }
  if (window.EP_BACKEND_BASE_URL_OVERRIDE) return normalizeOverride(window.EP_BACKEND_BASE_URL_OVERRIDE);
  return null;
}
const _override = _detectBackendOverride();
export const BACKEND_BASE_URL = _override || (IS_STAGING
  ? "https://api-staging.espacopreludio.com.br"
  : "https://api.espacopreludio.com.br");

// ─── 2 apps Firebase (default + patient) ─────────────────────────────────
// getApps() retorna lista de TODOS apps inicializados — preciso checar
// pelo NOME especifico se ja existe, em vez de assumir [DEFAULT].
function _ensureApp(name, config) {
  const existing = getApps().find(a => a.name === name);
  if (existing) return existing;
  return initializeApp(config, name);
}

// App default = profissional (mantem nome "[DEFAULT]" pra compat com
// codigo legado que faz initializeApp() sem nome).
const professionalApp = (() => {
  const existing = getApps().find(a => a.name === "[DEFAULT]");
  return existing || initializeApp(firebaseConfig);
})();
const patientApp = _ensureApp("patient", firebaseConfig);
const institutionApp = _ensureApp("institution", firebaseConfig);
const rtApp = _ensureApp("responsavel-tecnico", firebaseConfig);

// Export padrao: aponta pro app correto baseado no perfil da pagina.
// Clinical data is fetched only through the authorized backend.
export const AUTH_CONTEXT = IS_PATIENT_PAGE ? "patient"
  : IS_INSTITUTION_PAGE ? "institution"
  : IS_RT_PAGE ? "rt"
  : "professional";
export const app = { patient: patientApp, institution: institutionApp, rt: rtApp, professional: professionalApp }[AUTH_CONTEXT];

// Mesma persistência do getAuth(), sem o popupRedirectResolver: o site não usa
// login por pop-up/redirecionamento, e o resolver padrão baixava o gapi e um
// iframe do firebaseapp.com por instância (~130 KB e 8 requisições por página).
const AUTH_PERSISTENCE = [indexedDBLocalPersistence, browserLocalPersistence, browserSessionPersistence];
function authOf(firebaseApp) {
  try { return initializeAuth(firebaseApp, { persistence: AUTH_PERSISTENCE }); }
  catch { return getAuth(firebaseApp); } // já inicializada nesta página
}
export const auth = authOf(app);

// Instâncias de outros perfis só quando uma tela precisa delas (ex.: excluir
// conta). Criar todas em toda página abria a persistência de cada uma à toa.
export const getProfessionalAuth  = () => authOf(professionalApp);
export const getPatientAuth       = () => authOf(patientApp);
export const getInstitutionAuth   = () => authOf(institutionApp);
export const getRtAuth            = () => authOf(rtApp);

// Every independently loaded clinical/admin screen transports MFA proof and
// handles enrollment challenges, including screens without auth-guard imports.
installClinicalFetch({ backend: BACKEND_BASE_URL });

// Expõe na window pra monitoring.js (carregado antes deste módulo como
// <script defer>) saber o domínio do backend e o ambiente. Também
// permite extensão futura (ex.: outras tools de observabilidade).
if (typeof window !== "undefined") {
  window.EP_BACKEND_BASE_URL = BACKEND_BASE_URL;
  window.EP_IS_STAGING = IS_STAGING;
  // window.EP_SENTRY_DSN = "https://...@sentry.io/..."  ← descomente e cole DSN do Sentry pra ativar
}

if (typeof console !== "undefined") {
  console.info(
    `[ep] ambiente: ${IS_STAGING ? "STAGING" : "PRODUCTION"} · ` +
    `perfil: ${IS_PATIENT_PAGE ? "PACIENTE" : IS_INSTITUTION_PAGE ? "INSTITUICAO" : IS_RT_PAGE ? "RT" : "PROFISSIONAL"} · ` +
    `backend: ${BACKEND_BASE_URL} · firebase: ${firebaseConfig.projectId}`
  );
}
