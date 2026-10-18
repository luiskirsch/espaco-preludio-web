// Early visual shell for floating tools. These display hints grant no API access.
(function () {
  if (window.EP_PROFESSIONAL_TOOLS) return;
  const key = 'ep:professional-tools:v1';
  let cached = null;
  const definitions = [
    {
      id: "epReceitaFab",
      cls: "ep-receita-fab",
      href: "./receita.html",
      label: "Emitir receita",
      cap: "receita",
      svg: '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 12h6m-3-3v6"/><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>'
    },
    {
      id: "epAtestadoFab",
      cls: "ep-atestado-fab",
      href: "./documento.html?tipo=atestado",
      label: "Emitir atestado",
      cap: "documentos-clinicos",
      svg: '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><polyline points="9 15 11 17 15 13"/></svg>'
    },
    {
      id: "epCalcFab",
      cls: "ep-calc-fab",
      href: "./calculadora.html",
      label: "Calculadora clínica",
      cap: "calculadora-clinica",
      svg: '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="4" y="2" width="16" height="20" rx="2"/><line x1="8" y1="6" x2="16" y2="6"/><line x1="8" y1="11" x2="8" y2="11"/><line x1="12" y1="11" x2="12" y2="11"/><line x1="16" y1="11" x2="16" y2="11"/><line x1="8" y1="15" x2="8" y2="15"/><line x1="12" y1="15" x2="12" y2="15"/><line x1="16" y1="15" x2="16" y2="15"/><line x1="8" y1="19" x2="12" y2="19"/></svg>'
    }
  ];
function injectAuroraFabStyle() {
  if (document.getElementById("ep-aurora-fab-style")) return;
  const style = document.createElement("style");
  style.id = "ep-aurora-fab-style";
  style.textContent = [
    ".ep-aurora-fab{position:fixed;right:16px;bottom:90px;width:52px;height:52px;border-radius:50%;border:2px solid #c89b4a;padding:0;background:#1c1f1d;display:block;overflow:hidden;cursor:pointer;box-shadow:0 4px 14px rgba(200,155,74,.30),0 1px 3px rgba(28,31,29,.10);transition:transform 160ms ease,box-shadow 160ms ease,border-color 160ms ease;z-index:180;}",
    ".ep-aurora-fab img{width:100%;height:100%;display:block;object-fit:cover;border-radius:50%;}",
    ".ep-aurora-fab:hover{transform:translateY(-2px) scale(1.04);border-color:#e2b76a;box-shadow:0 8px 22px rgba(200,155,74,.42),0 2px 4px rgba(28,31,29,.14);}",
    ".ep-aurora-fab:active{transform:translateY(0) scale(1);}",
    ".ep-aurora-fab:focus-visible{outline:2px solid #c89b4a;outline-offset:2px;}",
    ".ep-aurora-fab[aria-expanded=\"true\"]{border-color:#e2b76a;box-shadow:0 0 0 3px rgba(226,183,106,.35),0 8px 22px rgba(200,155,74,.42);}",
    "body:has(.ep-logout-fab) .ep-aurora-fab{bottom:156px;}",
    // Na coluna do desktop: logo acima do "?" (que passa pra ordem 8).
    ".ep-aurora-fab,body.ep-has-sidebar .ep-fab-stack>.ep-aurora-fab{order:7;}",
    ".ep-fab-stack>.ep-help-bubble,body.ep-has-sidebar .ep-fab-stack>.ep-help-bubble{order:8;}",
    "@media (min-width:900px){.ep-fab-stack>.ep-aurora-fab{position:relative!important;top:auto!important;right:auto!important;bottom:auto!important;margin:0!important;}}",
    // Fora da coluna (celular, ou páginas sem sidebar), cada botão tem altura
    // fixa: a Aurora ocupa a vaga acima do "?" e os de cima sobem uma posição.
    "@media (max-width:899px){body:has(.ep-aurora-fab) :is(.ep-msg-bubble-fab,.ep-theme-toggle,.ep-notif-fab){translate:0 -66px;}}",
    "body:has(.ep-aurora-fab) :is(.ep-msg-bubble-fab,.ep-theme-toggle,.ep-notif-fab):not(.ep-fab-stack > *){translate:0 -66px;}",
    "body.ep-consult .ep-aurora-fab{display:none!important;}",
    ".ep-aurora-typing{display:inline-flex;align-items:center;gap:7px;}",
    ".ep-aurora-typing__dots{display:inline-flex;align-items:center;gap:3px;height:10px;}",
    ".ep-aurora-typing__dots i{width:5px;height:5px;border-radius:50%;background:currentColor;opacity:.35;animation:ep-aurora-typing 1.2s ease-in-out infinite;}",
    ".ep-aurora-typing__dots i:nth-child(2){animation-delay:.15s;}",
    ".ep-aurora-typing__dots i:nth-child(3){animation-delay:.3s;}",
    "@keyframes ep-aurora-typing{0%,60%,100%{transform:translateY(0);opacity:.35}30%{transform:translateY(-3px);opacity:1}}",
    "@media (prefers-reduced-motion:reduce){.ep-aurora-typing__dots i{animation:none;opacity:.6;}}",
    "@media print{.ep-aurora-fab{display:none!important;}}",
    // Painel: no desktop ao lado da coluna de botões; no celular, largura toda.
    "@media (min-width:900px){#epSupportPanel{right:88px!important;bottom:24px!important;}}",
    "@media (max-width:899px){#epSupportPanel{left:8px!important;right:8px!important;width:auto!important;bottom:12px!important;}}"
  ].join("");
  document.head.appendChild(style);
}

  function read() {
    try {
      const value = JSON.parse(sessionStorage.getItem(key) || 'null');
      cached = value && typeof value.uid === 'string' && value.uid && value.uid.length <= 160 && Array.isArray(value.tools)
        ? { uid: value.uid, tools: value.tools.filter(cap => definitions.some(tool => tool.cap === cap)) } : null;
    } catch { cached = null; }
  }
  function add(stack, id, cls, href, label, html) {
    let element = document.getElementById(id);
    if (!element) {
      element = document.createElement(href ? 'a' : 'button');
      element.id = id; element.className = cls;
      if (href) element.href = href; else element.type = 'button';
      element.title = label; element.setAttribute('aria-label', label); element.innerHTML = html;
      stack.appendChild(element);
    }
    return element;
  }
  const icon = path => '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'+path+'</svg>';
  function mount() {
    if (!document.body || !document.body.classList.contains('ep-has-sidebar')) return;
    injectAuroraFabStyle();
    let stack = document.querySelector('.ep-fab-stack');
    if (!stack) { stack = document.createElement('div'); stack.className = 'ep-fab-stack'; document.body.appendChild(stack); }
    const dark = document.documentElement.dataset.theme === 'dark';
    add(stack, 'epThemeToggle', 'ep-theme-toggle', null, dark ? 'Alternar para tema claro' : 'Alternar para tema escuro', icon(dark ? '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"/>' : '<path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>'));
    if (!/\/(mensagens|mensagens-pro)\.html$/.test(location.pathname)) add(stack, 'epMessagesBubble', 'ep-msg-bubble-fab', './mensagens-pro.html', 'Abrir Chat', icon('<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>')+'<span class="ep-msg-bubble-fab__badge ep-hide" aria-hidden="true">0</span>');
    add(stack, 'epNotificationEarly', 'ep-notif-fab', './notificacoes.html', 'Notificações', icon('<path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/>')+'<span class="ep-notif-fab__badge" id="sidebarNotifBadge" style="display:none">0</span>');
    const aurora = add(stack, 'epAuroraBubble', 'ep-aurora-fab', null, 'Aurora · assistente IA 24/7', '<img src="/img/aurora-avatar.png" alt="" width="52" height="52" aria-hidden="true">');
    if (!aurora.hasAttribute('aria-expanded')) aurora.setAttribute('aria-expanded', 'false');
    const help = document.getElementById('epHelpBubble');
    if (help) {
      document.getElementById('epHelpEarly')?.remove();
      if (help.parentNode !== stack) stack.appendChild(help);
    } else add(stack, 'epHelpEarly', 'ep-help-bubble', './suporte.html', 'Suporte e ajuda', icon('<circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><path d="M12 17h.01"/>'));
    for (const tool of definitions) {
      if (cached?.tools.includes(tool.cap)) add(stack, tool.id, tool.cls, tool.href, tool.label, tool.svg);
      else document.getElementById(tool.id)?.remove();
    }
  }
  function save(uid, capabilities) {
    if (typeof uid !== 'string' || !uid) { clear(); return; }
    cached = { uid, tools: definitions.filter(tool => Array.isArray(capabilities) && capabilities.includes(tool.cap)).map(tool => tool.cap) };
    try { sessionStorage.setItem(key, JSON.stringify(cached)); } catch {}
    mount();
  }
  function clear() { cached = null; try { sessionStorage.removeItem(key); } catch {} mount(); }
  function reconcile(uid) { if (!uid || cached && cached.uid !== uid) clear(); }
  read();
  window.EP_PROFESSIONAL_TOOLS = { mount, save, clear, reconcile };
  new MutationObserver(() => mount()).observe(document.documentElement, { childList: true, subtree: true });
  document.addEventListener('click', event => { if (event.target.closest?.('#sidebarLogout,#logoutBtn')) clear(); }, { capture: true });
  document.addEventListener('prerenderingchange', () => { read(); mount(); });
})();
