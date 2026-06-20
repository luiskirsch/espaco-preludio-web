(() => {
  if (document.querySelector(".ep-trust-footer")) return;

  function tr(key, fallback) {
    try {
      if (window.EP_I18N && window.i18next) {
        const v = window.i18next.t(key);
        if (v && v !== key) return v;
      }
    } catch (_) {}
    return fallback;
  }

  function render() {
    const existing = document.querySelector(".ep-trust-footer");
    if (existing) {
      existing.querySelector("[data-trust='security']").textContent = tr("index:trust.security", "Ambiente Seguro: Criptografia AES-256 & TLS 1.3");
      existing.querySelector("[data-trust='lgpd']").textContent    = tr("index:trust.lgpd",     "Em conformidade com a LGPD e Marco Civil da Internet");
      existing.querySelector("[data-trust='icp']").textContent     = tr("index:trust.icp",      "Suporte a Assinatura Digital ICP-Brasil");
      return;
    }

    const el = document.createElement("div");
    el.className = "ep-trust-footer";
    el.setAttribute("role", "contentinfo");
    el.setAttribute("aria-label", "Selos de segurança e conformidade");
    el.innerHTML = `
      <div class="ep-trust-row">
        <span class="ep-trust-item">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></svg>
          <span data-trust="security">${tr("index:trust.security", "Ambiente Seguro: Criptografia AES-256 &amp; TLS 1.3")}</span>
        </span>
        <span class="ep-trust-item">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3l8 3v6c0 5-3.5 8.5-8 9-4.5-.5-8-4-8-9V6l8-3z"/><path d="M9 12l2 2 4-4"/></svg>
          <span data-trust="lgpd">${tr("index:trust.lgpd", "Em conformidade com a LGPD e Marco Civil da Internet")}</span>
        </span>
        <span class="ep-trust-item">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5"/><path d="M9 14l2 2 4-4"/></svg>
          <span data-trust="icp">${tr("index:trust.icp", "Suporte a Assinatura Digital ICP-Brasil")}</span>
        </span>
        <span class="ep-trust-lang" id="ep-trust-lang-slot"></span>
      </div>
    `;
    document.body.appendChild(el);
    moveLang();
  }

  function moveLang() {
    const slot    = document.getElementById("ep-trust-lang-slot");
    const switcher = document.getElementById("ep-lang-switcher");
    if (slot && switcher && !slot.contains(switcher)) {
      slot.appendChild(switcher);
    }
  }

  render();
  document.addEventListener("ep:i18n-ready", () => { render(); moveLang(); });
  setTimeout(moveLang, 800);
})();
