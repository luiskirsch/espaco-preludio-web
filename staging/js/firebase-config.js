// Espaço Prelúdio — Firebase + Backend config com detecção AUTOMÁTICA de
// ambiente baseada no path da URL:
//
//   /staging/* → ambiente STAGING (Firebase sextolugar-staging + backend staging)
//   resto      → ambiente PRODUCTION (Firebase osextolugar-game + backend production)
//
// O mesmo arquivo serve os 2 deploys do GitHub Pages (raiz e /staging/).
// Refresh: o objeto IS_STAGING é avaliado SÍNCRONO no load do módulo, então
// trocar de ambiente exige hard reload (cache do browser).

import { initializeApp, getApps, getApp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

const IS_STAGING = typeof location !== "undefined" && location.pathname.startsWith("/staging/");

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

export const BACKEND_BASE_URL = IS_STAGING
  ? "https://osl-video-server-staging.up.railway.app"
  : "https://osl-video-server-production.up.railway.app";

export const app  = getApps().length ? getApp() : initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db   = getFirestore(app);

// Console log único — facilita debug ao abrir DevTools em qualquer página.
if (typeof console !== "undefined") {
  console.info(`[ep] ambiente: ${IS_STAGING ? "STAGING" : "PRODUCTION"} · backend: ${BACKEND_BASE_URL} · firebase: ${firebaseConfig.projectId}`);
}
