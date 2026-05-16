// Espaço Prelúdio — preflight de capabilities.
// Roda SÍNCRONO no <head> ANTES do <body> renderizar. Le o cache de
// /therapy/profissional/me do sessionStorage e injeta <style> que esconde
// links restritos por capability — evita flash de conteúdo restrito (FORC)
// na navegação entre páginas do painel profissional.
//
// Sem cache (primeira visita pós-login OU sessionStorage limpo): no-op,
// menu renderiza normal e applyCapabilityVisibility() do auth-guard.js
// esconde após o fetch terminar (~100-500ms). Esse fallback so afeta a
// PRIMEIRA navegação após login — toda navegação seguinte é instantânea.
//
// Carregado por <script src="./js/capability-preflight.js"></script> no
// <head> de cada HTML profissional (sem type="module" pra evitar defer —
// precisa rodar SYNC durante parse do head).

(function () {
  if (typeof document === "undefined") return;
  try {
    var raw = sessionStorage.getItem("ep:profile:v2");
    if (!raw) return;
    var entry = JSON.parse(raw);
    var caps = entry && entry.profile && entry.profile.conselho && entry.profile.conselho.capabilities;
    if (!Array.isArray(caps)) return;
    var has = function (c) { return caps.indexOf(c) !== -1; };

    // Mesma matriz de RULES do applyCapabilityVisibility (auth-guard.js).
    // Se mudar lá, sincronizar aqui.
    var hideSelectors = [];
    if (!has("receita"))              hideSelectors.push('a[href*="receita.html"]', 'button[data-href*="receita.html"]');
    if (!has("documentos-clinicos"))  hideSelectors.push('a[href*="documento.html"]', 'button[data-href*="documento.html"]');
    if (!has("calculadora-clinica"))  hideSelectors.push('a[href*="calculadora.html"]', 'button[data-href*="calculadora.html"]');
    if (hideSelectors.length === 0) return;

    var style = document.createElement("style");
    style.id = "ep-capability-preflight";
    style.textContent = hideSelectors.join(",") + "{display:none !important;}";
    document.head.appendChild(style);
  } catch (e) { /* no-op — auth-guard cuida do fallback */ }
})();
