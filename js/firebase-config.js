// Espaço Prelúdio — Firebase config (mesma instância sextolugar-staging do jogo).
// O role "therapist" é gravado em therapists/{uid}; security rules filtram acesso.

import { initializeApp, getApps, getApp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

export const firebaseConfig = {
  apiKey: "AIzaSyAflOnCIpF6NYCxdd23XSZTLK2V54XLGFU",
  authDomain: "sextolugar-staging.firebaseapp.com",
  projectId: "sextolugar-staging",
  storageBucket: "sextolugar-staging.firebasestorage.app",
  messagingSenderId: "407627003441",
  appId: "1:407627003441:web:c501d2d46f04f40cd7c710",
  measurementId: "G-WRYDRCC4GV",
  __isStagingProject: true
};

export const app  = getApps().length ? getApp() : initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db   = getFirestore(app);

export const BACKEND_BASE_URL = "https://osl-video-server-staging.up.railway.app";
