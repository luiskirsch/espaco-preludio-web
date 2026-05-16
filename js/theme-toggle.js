// Espaço Prelúdio — botão flutuante de toggle de tema (sol/lua).
// Módulo dedicado pra ser importado tanto pelo guard do profissional
// (auth-guard.js) quanto pelo guard do paciente (patient-auth-guard.js)
// sem o paciente ter que carregar auth-guard inteiro (cmdk.js, recallDek,
// 2FA, etc).
//
// Empilha acima do help bubble (canto inferior direito). Idempotente.
// No-op em /2fa-verify.html (mesma exceção do help bubble). Aparece também
// em páginas sem login pra escolha de tema antecipada. Persistência via
// theme.js → localStorage.

import { getTheme, toggleTheme } from "./theme.js";

const SUN = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"/></svg>';
const MOON = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>';

export function mountThemeToggle() {
  if (typeof document === "undefined") return;
  if (document.getElementById("epThemeToggle")) return;
  const path = location.pathname.toLowerCase();
  if (path.endsWith("/2fa-verify.html")) return;

  const btn = document.createElement("button");
  btn.id = "epThemeToggle";
  btn.type = "button";
  btn.className = "ep-theme-toggle";
  function paint() {
    const dark = getTheme() === "dark";
    btn.innerHTML = dark ? SUN : MOON;
    btn.setAttribute("aria-label", dark ? "Alternar para tema claro" : "Alternar para tema escuro");
    btn.setAttribute("title", dark ? "Tema claro" : "Tema escuro");
  }
  paint();
  btn.addEventListener("click", () => { toggleTheme(); paint(); });
  document.body.appendChild(btn);
}
