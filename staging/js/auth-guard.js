// Espaço Prelúdio — guard de autenticação para páginas que exigem profissional logado.
// Uso:
//   import { requireTherapist } from "./js/auth-guard.js";
//   const { user, idToken, therapist } = await requireTherapist();

import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";
import { auth, BACKEND_BASE_URL } from "./firebase-config.js";
import { recallDek } from "./crypto.js";

export function authReady() {
  return new Promise((resolve) => {
    const unsub = onAuthStateChanged(auth, (user) => {
      unsub();
      resolve(user || null);
    });
  });
}

export async function fetchTherapistProfile(idToken) {
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

// Esconde links de nav que apontam pra features cujo conselho do profissional
// não habilita. Match por substring no href — links com href contendo
// "receita.html" são ocultados pra quem não tem capability "receita", e
// "documento.html" pra quem não tem "documentos-clinicos".
//
// Backend continua sendo a fonte da verdade (requireCapability nos endpoints).
// Esta função só evita que o user clique em algo que vai cair em 403.
function applyCapabilityVisibility(capabilities) {
  const set = new Set(capabilities || []);
  const RULES = [
    { match: "receita.html",   capability: "receita" },
    { match: "documento.html", capability: "documentos-clinicos" }
  ];
  document.querySelectorAll("a[href], button[data-href]").forEach(el => {
    const href = (el.getAttribute("href") || el.getAttribute("data-href") || "").toLowerCase();
    for (const rule of RULES) {
      if (href.includes(rule.match) && !set.has(rule.capability)) {
        el.style.display = "none";
        el.setAttribute("aria-hidden", "true");
      }
    }
  });
  // Botões/elementos com data-capability="X" explícito também são ocultados.
  document.querySelectorAll("[data-capability]").forEach(el => {
    const cap = el.getAttribute("data-capability");
    if (cap && !set.has(cap)) {
      el.style.display = "none";
      el.setAttribute("aria-hidden", "true");
    }
  });
}

export async function requireTherapist({ requireDek = true } = {}) {
  const user = await authReady();
  if (!user) {
    window.location.href = "./login.html";
    throw new Error("NOT_AUTHENTICATED");
  }

  const idToken = await user.getIdToken();
  const profile = await fetchTherapistProfile(idToken);

  if (!profile.ok) {
    if (profile.code === "NAO_REGISTRADO") {
      window.location.href = "./cadastro.html?step=profissional";
    } else {
      window.location.href = "./login.html?error=" + encodeURIComponent(profile.code);
    }
    throw new Error(profile.code);
  }

  // Aplica visibilidade baseada nas capabilities do conselho — esconde
  // links/botões pra features que o profissional não pode usar.
  applyCapabilityVisibility(profile.conselho?.capabilities);

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
