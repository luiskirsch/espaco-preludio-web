// Espaço Prelúdio — guard de autenticação para páginas que exigem PACIENTE
// logado (paciente-painel.html). Espelha auth-guard.js do profissional, mas
// usa coleção `therapy_patient_accounts` e sessionStorage namespaced.

import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";
import { auth, BACKEND_BASE_URL } from "./firebase-config.js";
import { recallPatientDek } from "./patient-session.js";

export function authReady() {
  return new Promise((resolve) => {
    const unsub = onAuthStateChanged(auth, (user) => {
      unsub();
      resolve(user || null);
    });
  });
}

export async function fetchPatientAccount(idToken) {
  const res = await fetch(`${BACKEND_BASE_URL}/therapy/paciente/me`, {
    headers: { "Authorization": `Bearer ${idToken}` }
  });
  if (res.status === 404) return { ok: false, code: "NAO_REGISTRADO" };
  const data = await res.json().catch(() => ({}));
  if (!res.ok) return { ok: false, code: data?.error || "ERRO_PERFIL" };
  return { ok: true, account: data.account };
}

export async function requirePatient({ requireDek = true } = {}) {
  const user = await authReady();
  if (!user) {
    window.location.href = "./paciente-login.html";
    throw new Error("NOT_AUTHENTICATED");
  }

  const idToken = await user.getIdToken();
  const profile = await fetchPatientAccount(idToken);

  if (!profile.ok) {
    if (profile.code === "NAO_REGISTRADO") {
      window.location.href = "./paciente-cadastro.html";
    } else {
      window.location.href = "./paciente-login.html?error=" + encodeURIComponent(profile.code);
    }
    throw new Error(profile.code);
  }

  if (requireDek) {
    const dek = recallPatientDek();
    if (!dek) {
      window.location.href = "./paciente-login.html?reauth=1&redirect=" + encodeURIComponent(location.pathname + location.search);
      throw new Error("DEK_AUSENTE");
    }
    return { user, idToken, account: profile.account, dek };
  }

  return { user, idToken, account: profile.account };
}
