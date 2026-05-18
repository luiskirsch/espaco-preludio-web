// Espaço Prelúdio — preflight de capabilities + slot de perfil.
// Roda SÍNCRONO no <head> ANTES do <body> renderizar. Le o cache de
// /therapy/profissional/me do sessionStorage e:
//   1. injeta <style> que esconde links restritos por capability (FORC),
//   2. aplica classe .ep-unregulated no <html> (layout grid do topbar),
//   3. preenche #topUserName / #topUserAvatar com nome + foto do cache
//      via MutationObserver — microtask antes do primeiro paint, evita
//      "salto" do pill de perfil quando o auth-guard.js termina o fetch.
//
// Sem cache (primeira visita pós-login OU sessionStorage limpo): no-op,
// menu/perfil renderizam com placeholder e auth-guard.js preenche após
// o fetch (~100-500ms). Afeta apenas a PRIMEIRA navegação após login.
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
    var profile = entry && entry.profile;
    if (!profile) return;
    var caps = profile.conselho && profile.conselho.capabilities;
    var therapist = profile.therapist;

    if (Array.isArray(caps)) {
      var has = function (c) { return caps.indexOf(c) !== -1; };

      // Mesma matriz de RULES do applyCapabilityVisibility (auth-guard.js).
      // Se mudar lá, sincronizar aqui.
      var hideSelectors = [];
      if (!has("receita"))              hideSelectors.push('a[href*="receita.html"]', 'button[data-href*="receita.html"]', '[data-capability="receita"]');
      if (!has("documentos-clinicos"))  hideSelectors.push('a[href*="documento.html"]', 'button[data-href*="documento.html"]', '[data-capability="documentos-clinicos"]');
      if (!has("calculadora-clinica"))  hideSelectors.push('a[href*="calculadora.html"]', 'button[data-href*="calculadora.html"]', '[data-capability="calculadora-clinica"]');

      // Conta nao regulamentada = sem nenhuma das capabilities reguladas.
      // Aplica a classe no <html> aqui (sincrono, pre-paint) pra evitar
      // FORC do topbar — sem isso o layout flex default aparece por ~100-500ms
      // ate o auth-guard fazer o toggle, causando "salto" visivel ao recarregar.
      var isRegulated = has("receita") || has("documentos-clinicos") || has("calculadora-clinica");
      if (!isRegulated) {
        document.documentElement.classList.add("ep-unregulated");
      }

      if (hideSelectors.length > 0) {
        var style = document.createElement("style");
        style.id = "ep-capability-preflight";
        style.textContent = hideSelectors.join(",") + "{display:none !important;}";
        document.head.appendChild(style);
      }
    }

    // Slot do perfil — replica logica de applyTopUserSlot (auth-guard.js).
    // Sem MutationObserver os elementos #topUserName/#topUserAvatar so
    // ganham conteudo depois do auth-guard rodar, causando "Perfil" → nome
    // real (pill encolhe/expande). MO roda em microtask, antes do paint.
    if (therapist) {
      var applyUserSlot = function () {
        var elName = document.getElementById("topUserName");
        var elAvatar = document.getElementById("topUserAvatar");
        if (!elName && !elAvatar) return false;

        var name = (therapist.displayName || "").trim();
        if (elName && elName.textContent !== name && name) {
          elName.textContent = name;
        }
        if (elAvatar) {
          var photoBase64 = therapist.photoBase64 || "";
          var photoMime   = therapist.photoMime   || "image/jpeg";
          if (photoBase64) {
            elAvatar.style.backgroundImage = "url(data:" + photoMime + ";base64," + photoBase64 + ")";
            elAvatar.style.backgroundSize = "cover";
            elAvatar.style.backgroundPosition = "center";
            elAvatar.textContent = "";
          } else if (name) {
            var matches = name.match(/\b\p{L}/gu) || [];
            var initials = matches.slice(0, 2).join("").toUpperCase() || "·";
            elAvatar.textContent = initials;
          }
          elAvatar.classList.add("ep-avatar-wrap");
          if (therapist.verificationStatus === "verified" && !elAvatar.querySelector(".ep-verified-badge")) {
            var badge = document.createElement("span");
            badge.className = "ep-verified-badge";
            badge.setAttribute("title", "Profissional verificado · inscrição no conselho confirmada");
            badge.setAttribute("aria-label", "Profissional verificado");
            badge.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 12l5 5L20 7" stroke-linecap="round" stroke-linejoin="round"/></svg>';
            elAvatar.appendChild(badge);
          }
        }
        return !!(elName && elAvatar);
      };

      if (!applyUserSlot()) {
        var obs = new MutationObserver(function () {
          if (applyUserSlot()) obs.disconnect();
        });
        obs.observe(document.documentElement, { childList: true, subtree: true });
        document.addEventListener("DOMContentLoaded", function () {
          applyUserSlot();
          obs.disconnect();
        }, { once: true });
      }
    }
  } catch (e) { /* no-op — auth-guard cuida do fallback */ }
})();
