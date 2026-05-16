// Espaço Prelúdio — guard de autenticação para páginas que exigem PACIENTE
// logado (paciente-painel.html). Espelha auth-guard.js do profissional, mas
// usa coleção `therapy_patient_accounts` e sessionStorage namespaced.

import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";
import { auth, BACKEND_BASE_URL } from "./firebase-config.js";
import { recallPatientDek } from "./patient-session.js";
import { mountThemeToggle } from "./auth-guard.js";

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
    mountMessagesBubble(idToken);
    mountThemeToggle();
    return { user, idToken, account: profile.account, dek };
  }

  mountMessagesBubble(idToken);
  mountThemeToggle();
  return { user, idToken, account: profile.account };
}

// Botão flutuante de mensagens — entre help e theme toggle. Polling 60s.
function mountMessagesBubble(idToken) {
  if (typeof document === "undefined") return;
  if (document.getElementById("epMessagesBubble")) return;
  if (location.pathname.toLowerCase().endsWith("/paciente-mensagens.html")) return;

  const a = document.createElement("a");
  a.id = "epMessagesBubble";
  a.href = "./paciente-mensagens.html";
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
      const r = await fetch(`${BACKEND_BASE_URL}/therapy/chat/threads`, {
        headers: { "Authorization": `Bearer ${idToken}` }
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
