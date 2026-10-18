// Prepare professional page shells and their static assets. Authentication and
// clinical reads start only after activation, through requireTherapist().
(function () {
  if (window.EP_PROFESSIONAL_NAV) return;
  const root = new URL('./', location.href);
  const pages = new Set(['painel.html', 'agenda.html', 'pacientes.html', 'prontuario.html',
    'financeiro.html', 'relatorios.html', 'clinica.html', 'inventario.html', 'marketing.html',
    'whatsapp.html', 'tiss.html', 'casos-publicos.html', 'perfil.html', 'planos.html',
    'notificacoes.html', 'mensagens.html', 'mensagens-pro.html', 'suporte.html',
    'aniversarios.html', 'lista-espera.html', 'audit.html', 'calculadora.html',
    'receita.html', 'documento.html', 'reproduzir.html']);
  const warmed = new Map(), assets = new Set();
  let started = false, hoverTimer;
  const constrained = () => navigator.connection?.saveData || /(^|-)2g$/.test(navigator.connection?.effectiveType || '');
  const idle = callback => window.requestIdleCallback
    ? window.requestIdleCallback(callback, { timeout: 1500 }) : setTimeout(callback, 180);
  function pageUrl(href) {
    try {
      const url = new URL(href, location.href);
      if (url.origin !== root.origin || url.pathname.slice(0, url.pathname.lastIndexOf('/') + 1) !== root.pathname || url.hash) return null;
      const name = url.pathname.split('/').pop();
      if (!pages.has(name) || url.href === location.href) return null;
      for (const key of url.searchParams.keys()) if (!['p', 'lang'].includes(key)) return null;
      if (name === 'prontuario.html' && !/^[a-zA-Z0-9_-]{1,160}$/.test(url.searchParams.get('p') || '')) return null;
      return url;
    } catch { return null; }
  }
  function hint(href, kind, base) {
    try {
      const url = new URL(href, base);
      if (url.origin !== root.origin || !url.pathname.startsWith(root.pathname) || !/\.(css|js)$/.test(url.pathname)) return;
      if (assets.has(url.href) || assets.size >= 48) return;
      assets.add(url.href);
      const link = document.createElement('link');
      link.rel = kind === 'module' ? 'modulepreload' : 'prefetch';
      if (kind !== 'module') link.as = kind;
      link.href = url.href; link.dataset.professionalAsset = '';
      document.head.appendChild(link);
    } catch { /* navigation still works if a hint cannot be created */ }
  }
  async function warm(href) {
    const url = pageUrl(href);
    if (!url || constrained()) return;
    if (warmed.has(url.href)) return warmed.get(url.href);
    const request = (async () => {
      try {
        // HTML is never persisted here: each navigation receives a fresh CSP nonce.
        const response = await fetch(url.href, { credentials: 'same-origin', cache: 'no-store', priority: 'low' });
        if (!response.ok || !response.headers.get('content-type')?.includes('text/html')) return;
        const html = new DOMParser().parseFromString(await response.text(), 'text/html');
        html.querySelectorAll('link[rel="stylesheet"][href]').forEach(el => hint(el.getAttribute('href'), 'style', url));
        html.querySelectorAll('script[src]').forEach(el => hint(el.getAttribute('src'), el.type === 'module' ? 'module' : 'script', url));
        html.querySelectorAll('script[type="module"]:not([src])').forEach(el => {
          for (const match of el.textContent.matchAll(/^\s*import\s+(?:[^;\n]*?\s+from\s+)?["']([^"']+)["']/gm)) hint(match[1], 'module', url);
        });
      } catch { warmed.delete(url.href); }
    })();
    warmed.set(url.href, request);
    return request;
  }
  function start() {
    if (started || document.prerendering || constrained()) return;
    started = true;
    const current = location.pathname.split('/').pop();
    const next = (current === 'painel.html' ? ['agenda.html', 'pacientes.html']
      : current === 'agenda.html' ? ['painel.html', 'pacientes.html']
        : current === 'prontuario.html' ? ['pacientes.html', 'agenda.html'] : ['painel.html', 'agenda.html'])
      .map(name => pageUrl(new URL(name, root).href)).filter(Boolean);
    if (window.HTMLScriptElement?.supports?.('speculationrules')) {
      const rules = document.createElement('script');
      rules.type = 'speculationrules'; rules.nonce = document.querySelector('script[nonce]')?.nonce || '';
      rules.dataset.professionalNavigation = '';
      // Only this platform's pages, including the exact patient query on a chart link.
      const where = { and: [
        { selector_matches: 'a[data-professional-preload]:not([target]):not([download])' },
        { not: { selector_matches: '.is-hidden, [hidden], [aria-hidden="true"]' } }
      ] };
      document.querySelectorAll('a[href]').forEach(a => { if (pageUrl(a.href)) a.dataset.professionalPreload = ''; });
      const observer = new MutationObserver(records => {
        records.forEach(record => record.addedNodes.forEach(node => {
          if (node.nodeType !== 1) return;
          const links = node.matches('a[href]') ? [node, ...node.querySelectorAll('a[href]')] : node.querySelectorAll('a[href]');
          links.forEach(a => { if (pageUrl(a.href)) a.dataset.professionalPreload = ''; });
        }));
      });
      observer.observe(document.body, { childList: true, subtree: true });
      rules.textContent = JSON.stringify({
        prerender: [...(next.length ? [{ source: 'list', urls: next.map(url => url.href), eagerness: 'immediate' }] : []),
          { source: 'document', where, eagerness: 'moderate' }]
      });
      document.head.appendChild(rules);
    }
    function intent(event) {
      const a = event.target.closest?.('a[href]');
      if (!a || a.target || a.hasAttribute('download')) return;
      clearTimeout(hoverTimer);
      if (event.type === 'pointerover') hoverTimer = setTimeout(() => warm(a.href), 80);
      else warm(a.href);
    }
    document.addEventListener('pointerover', intent, { passive: true });
    document.addEventListener('pointerout', () => clearTimeout(hoverTimer), { passive: true });
    document.addEventListener('focusin', intent);
    document.addEventListener('touchstart', intent, { passive: true });
    idle(() => { for (const url of next) warm(url.href); });
  }
  window.EP_PROFESSIONAL_NAV = { start, warm };
})();
