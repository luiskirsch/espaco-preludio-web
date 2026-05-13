// Modo claro/escuro — persistência em localStorage e aplicação no <html>.
// Aplica IMEDIATAMENTE no import pra evitar FOUC (flash of unstyled content):
// como módulos ES são deferred, quando este script roda o <html> já existe,
// mas o conteúdo do <body> ainda não foi pintado.

const STORAGE_KEY = "ep:theme";

export function getTheme() {
  try { return localStorage.getItem(STORAGE_KEY) || "light"; }
  catch { return "light"; }
}

export function setTheme(theme) {
  const t = theme === "dark" ? "dark" : "light";
  try { localStorage.setItem(STORAGE_KEY, t); } catch {}
  applyTheme(t);
  return t;
}

export function applyTheme(theme) {
  const t = theme === "dark" ? "dark" : "light";
  if (typeof document === "undefined") return;
  if (t === "dark") document.documentElement.setAttribute("data-theme", "dark");
  else document.documentElement.removeAttribute("data-theme");
}

export function toggleTheme() {
  return setTheme(getTheme() === "dark" ? "light" : "dark");
}

// Aplica armazenado imediatamente (evita FOUC).
applyTheme(getTheme());
