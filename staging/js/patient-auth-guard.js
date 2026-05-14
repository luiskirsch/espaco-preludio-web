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
    mountUnreadBadgePoller(idToken);
    return { user, idToken, account: profile.account, dek };
  }

  mountUnreadBadgePoller(idToken);
  return { user, idToken, account: profile.account };
}

// Badge unread no link "Mensagens" da topbar do paciente. Polling 60s.
function mountUnreadBadgePoller(idToken) {
  if (typeof document === "undefined") return;
  const link = document.querySelector('a[href="./paciente-mensagens.html"]');
  if (!link) return;
  let badge = link.querySelector(".ep-unread-pill");
  if (!badge) {
    badge = document.createElement("span");
    badge.className = "ep-unread-pill ep-hide";
    link.appendChild(badge);
  }
  async function refresh() {
    try {
      const r = await fetch(`${BACKEND_BASE_URL}/therapy/chat/threads`, {
        headers: { "Authorization": `Bearer ${idToken}` }
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok || !d.ok) return;
      const unread = (d.threads || []).filter(t => t.hasUnread).length;
      if (unread > 0) {
        badge.textContent = String(unread);
        badge.classList.remove("ep-hide");
      } else {
        badge.classList.add("ep-hide");
      }
    } catch {}
  }
  refresh();
  setInterval(refresh, 60_000);
}
