// Espaço Prelúdio — Firebase + Backend config com 2 detecções automáticas:
//
// (1) Ambiente (staging vs production) — por path:
//     /staging/* → STAGING (Firebase sextolugar-staging + backend staging)
//     resto      → PRODUCTION (Firebase osextolugar-game + backend production)
//
// (2) Perfil (paciente vs profissional) — por path:
//     /paciente-* ou /entrar.html → PACIENTE (Firebase app "patient")
//     resto                       → PROFISSIONAL (Firebase app "[DEFAULT]")
//
// (2) RESOLVE bug critico: sem isso, ambos perfis compartilham a MESMA
// instancia Firebase Auth, e login do paciente em outra aba derruba a
// sessao do profissional (e vice-versa) — onAuthStateChanged dispara
// pra todas as abas da mesma origem que compartilham a app.
//
// Cada Firebase app tem nome diferente => persistencia IndexedDB
// namespaced separadamente => 2 sessoes independentes no mesmo browser.

import { initializeApp, getApps, getApp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

// ─── Detecções ─────────────────────────────────────────────────────────
const _path = typeof location !== "undefined" ? location.pathname : "";
const IS_STAGING = _path.startsWith("/staging/");
const IS_PATIENT_PAGE =
  _path.includes("/paciente-") ||
  _path.endsWith("/entrar.html");

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
  try {
    const qs = new URLSearchParams(location.search).get("backend");
    if (qs) {
      try { localStorage.setItem("ep_backend_url_override", qs); } catch (_) {}
      return qs;
    }
    const ls = localStorage.getItem("ep_backend_url_override");
    if (ls) return ls;
  } catch (_) { /* localStorage indisponivel */ }
  if (window.EP_BACKEND_BASE_URL_OVERRIDE) return window.EP_BACKEND_BASE_URL_OVERRIDE;
  return null;
}
const _override = _detectBackendOverride();
export const BACKEND_BASE_URL = _override || (IS_STAGING
  ? "https://osl-video-server-staging.up.railway.app"
  : "https://osl-video-server-production.up.railway.app");

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

// Export padrao: aponta pro app correto baseado no perfil da pagina.
// Codigo existente que faz `import { auth, db } from firebase-config` continua
// funcionando sem mudanca — auth/db ja vem do app certo.
export const app  = IS_PATIENT_PAGE ? patientApp : professionalApp;
export const auth = getAuth(app);
export const db   = getFirestore(app);

// Tambem exporta os 2 apps explicitos pra casos especiais (admin pages
// que precisam consultar ambos perfis, por exemplo).
export const authProfessional = getAuth(professionalApp);
export const authPatient      = getAuth(patientApp);
export const dbProfessional   = getFirestore(professionalApp);
export const dbPatient        = getFirestore(patientApp);

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
    `perfil: ${IS_PATIENT_PAGE ? "PACIENTE" : "PROFISSIONAL"} · ` +
    `backend: ${BACKEND_BASE_URL} · firebase: ${firebaseConfig.projectId}`
  );
}
