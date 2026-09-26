(() => {
  if (document.querySelector(".ep-trust-footer")) return;

  const el = document.createElement("div");
  el.className = "ep-trust-footer";
  el.setAttribute("role", "contentinfo");
  el.setAttribute("aria-label", "Selos de segurança e conformidade");
  el.innerHTML = `
    <div class="ep-trust-row">
      <span class="ep-trust-item">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></svg>
        <span data-i18n="index:trust.security">Ambiente Seguro: Criptografia AES-256 &amp; TLS 1.3</span>
      </span>
      <span class="ep-trust-item">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3l8 3v6c0 5-3.5 8.5-8 9-4.5-.5-8-4-8-9V6l8-3z"/><path d="M9 12l2 2 4-4"/></svg>
        <span data-i18n="index:trust.lgpd">Em conformidade com a LGPD e Marco Civil da Internet</span>
      </span>
      <span class="ep-trust-item">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5"/><path d="M9 14l2 2 4-4"/></svg>
        <span data-i18n="index:trust.icp">Suporte a Assinatura Digital ICP-Brasil</span>
      </span>
    </div>
  `;
  document.body.appendChild(el);
})();
