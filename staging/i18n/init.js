// Espaço Prelúdio — sistema i18n (mesma arquitetura do Prelúdio Jogos).
// Carrega i18next via CDN, lê JSONs de /i18n/locales/{lng}/{ns}.json,
// aplica traduções via data-i18n em elementos do DOM. Switcher flutuante
// no canto inferior direito.
//
// Suporta 3 idiomas: pt-BR (default), en-US, es-ES.
// Páginas declaram namespaces via <html data-i18n-ns="index,common">.
// "common" é incluso automaticamente.

(function () {
  'use strict';

  // Força HTTPS — evita que mobile acesse via HTTP sem redirecionamento do servidor.
  if (location.protocol === 'http:' && location.hostname !== 'localhost' && location.hostname !== '127.0.0.1') {
    location.replace('https:' + location.href.slice(5));
    return;
  }

  if (window.EP_I18N_LOADED) return;
  window.EP_I18N_LOADED = true;

  const SUPPORTED = ['pt-BR', 'en-US', 'es-ES'];
  const DEFAULT_LOCALE = 'pt-BR';
  const STORAGE_KEY = 'ep_lang';
  const I18NEXT_CDN = '/i18n/i18next.min.js';
  const BACKEND_CDN = '/i18n/i18nextHttpBackend.min.js';

  // Some pages mark <html class="ep-i18n-pending"> inline (before any CSS/JS
  // loads) to hide <body> via CSS while a non-default locale is being applied,
  // avoiding a flash of pt-BR text. Always reveal it once we're done — or after
  // a timeout, in case bootstrap() fails (e.g. CDN unreachable).
  const revealTimer = setTimeout(reveal, 2500);
  function reveal() {
    clearTimeout(revealTimer);
    document.documentElement.classList.remove('ep-i18n-pending');
  }

  function detectLocale() {
    try {
      const url = new URLSearchParams(location.search).get('lang');
      if (url && SUPPORTED.includes(url)) return url;
    } catch (_) { /* empty */ }
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored && SUPPORTED.includes(stored)) return stored;
    } catch (_) { /* empty */ }
    const nav = (navigator.language || '').toLowerCase();
    if (nav.startsWith('en')) return 'en-US';
    if (nav.startsWith('es')) return 'es-ES';
    return DEFAULT_LOCALE;
  }

  function getBasePath() {
    const scripts = document.getElementsByTagName('script');
    for (let i = 0; i < scripts.length; i++) {
      const src = scripts[i].src || '';
      if (src.includes('/i18n/init.js')) {
        return src.replace(/\/init\.js.*$/, '').replace(location.origin, '');
      }
    }
    return '/i18n';
  }

  function loadScript(src) {
    return new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = src;
      s.onload = resolve;
      s.onerror = () => reject(new Error('failed to load ' + src));
      document.head.appendChild(s);
    });
  }

  function getNamespaces() {
    const raw = document.documentElement.getAttribute('data-i18n-ns') || '';
    const ns = raw.split(',').map(s => s.trim()).filter(Boolean);
    if (!ns.includes('common')) ns.unshift('common');
    return ns;
  }

  function applyTranslations(root) {
    root = root || document;
    if (!window.i18next || !window.i18next.t) return;
    const t = window.i18next.t.bind(window.i18next);

    root.querySelectorAll('[data-i18n]').forEach(el => {
      const key = el.getAttribute('data-i18n');
      if (!key) return;
      const value = t(key);
      if (typeof value === 'string' && value !== key) el.textContent = value;
    });

    // data-i18n-html: usa innerHTML pra preservar tags inline. Translations
    // vêm dos JSONs do repo, sem input de usuário — XSS-safe.
    root.querySelectorAll('[data-i18n-html]').forEach(el => {
      const key = el.getAttribute('data-i18n-html');
      if (!key) return;
      const value = t(key);
      if (typeof value === 'string' && value !== key) el.innerHTML = value;
    });

    const attrs = ['title', 'placeholder', 'alt', 'value', 'aria-label', 'content', 'label'];
    attrs.forEach(attr => {
      root.querySelectorAll(`[data-i18n-${attr}]`).forEach(el => {
        const key = el.getAttribute(`data-i18n-${attr}`);
        if (!key) return;
        const value = t(key);
        if (typeof value === 'string' && value !== key) el.setAttribute(attr, value);
      });
    });

    const titleEl = document.querySelector('title[data-i18n]');
    if (titleEl) {
      const key = titleEl.getAttribute('data-i18n');
      const value = t(key);
      if (typeof value === 'string' && value !== key) document.title = value;
    }
  }

  function createSwitcher() {
    if (document.getElementById('ep-lang-switcher')) return;
    const cur = window.i18next.language;
    // SVG inline em vez de emoji 🇧🇷/🇺🇸/🇪🇸 — Windows nao renderiza emoji
    // regional flag, mostra os 2 letras do codigo (BR/US/ES). SVG inline
    // funciona em qualquer SO + nao depende de fonte de emoji.
    const FLAG_SVG = {
      'pt-BR': '<svg viewBox="0 0 14 10" width="18" height="13" style="vertical-align:middle;border-radius:2px"><rect width="14" height="10" fill="#009c3b"/><polygon points="7,1 13,5 7,9 1,5" fill="#ffdf00"/><circle cx="7" cy="5" r="1.9" fill="#002776"/></svg>',
      'en-US': '<svg viewBox="0 0 19 10" width="18" height="13" style="vertical-align:middle;border-radius:2px"><rect width="19" height="10" fill="#fff"/><rect width="19" height="0.77" y="0" fill="#b22234"/><rect width="19" height="0.77" y="1.54" fill="#b22234"/><rect width="19" height="0.77" y="3.08" fill="#b22234"/><rect width="19" height="0.77" y="4.62" fill="#b22234"/><rect width="19" height="0.77" y="6.15" fill="#b22234"/><rect width="19" height="0.77" y="7.69" fill="#b22234"/><rect width="19" height="0.77" y="9.23" fill="#b22234"/><rect width="7.6" height="5.38" fill="#3c3b6e"/></svg>',
      'es-ES': '<svg viewBox="0 0 6 4" width="18" height="13" style="vertical-align:middle;border-radius:2px"><rect width="6" height="4" fill="#aa151b"/><rect y="1" width="6" height="2" fill="#f1bf00"/></svg>'
    };
    const CODES = { 'pt-BR': 'PT', 'en-US': 'EN', 'es-ES': 'ES' };
    const LABELS = { 'pt-BR': 'Português', 'en-US': 'English', 'es-ES': 'Español' };
    const flagSvg = FLAG_SVG[cur] || FLAG_SVG[DEFAULT_LOCALE];
    const code = CODES[cur] || CODES[DEFAULT_LOCALE];

    const wrap = document.createElement('div');
    wrap.id = 'ep-lang-switcher';
    wrap.innerHTML =
      '<button type="button" id="ep-lang-btn" aria-label="Idioma / Language / Idioma">' +
      flagSvg + ' ' + code +
      '</button>' +
      '<div id="ep-lang-menu" hidden>' +
      SUPPORTED.map(l => `<button type="button" data-lang="${l}">${FLAG_SVG[l]} ${LABELS[l]}</button>`).join('') +
      '</div>';

    const style = document.createElement('style');
    style.textContent =
      '#ep-lang-switcher{position:fixed;bottom:16px;right:16px;z-index:2147483646;' +
      'font-family:system-ui,-apple-system,Segoe UI,sans-serif}' +
      '#ep-lang-btn{all:unset;cursor:pointer;background:rgba(28,31,29,.78);color:#fff;' +
      'padding:6px 11px;border-radius:999px;font-size:12px;font-weight:600;' +
      'display:inline-flex;align-items:center;gap:6px;' +
      'backdrop-filter:blur(4px);-webkit-backdrop-filter:blur(4px);' +
      'border:1px solid rgba(255,255,255,.14);box-shadow:0 4px 14px rgba(0,0,0,.32)}' +
      '#ep-lang-btn:hover{background:rgba(28,31,29,.92)}' +
      '#ep-lang-menu{position:absolute;bottom:calc(100% + 6px);right:0;' +
      'background:rgba(15,18,28,.96);backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px);' +
      'border:1px solid rgba(255,255,255,.12);border-radius:10px;padding:6px;' +
      'display:flex;flex-direction:column;gap:2px;box-shadow:0 8px 24px rgba(0,0,0,.45);min-width:150px}' +
      '#ep-lang-menu[hidden]{display:none}' +
      '#ep-lang-menu button{all:unset;cursor:pointer;padding:8px 10px;color:#fff;' +
      'font-size:13px;border-radius:6px;display:flex;align-items:center;gap:8px}' +
      '#ep-lang-menu button:hover{background:rgba(255,255,255,.08)}' +
      '@media print{#ep-lang-switcher{display:none !important}}';

    document.head.appendChild(style);
    (document.body || document.documentElement).appendChild(wrap);

    const btn = wrap.querySelector('#ep-lang-btn');
    const menu = wrap.querySelector('#ep-lang-menu');

    btn.addEventListener('click', e => {
      e.stopPropagation();
      menu.hidden = !menu.hidden;
    });
    document.addEventListener('click', () => { menu.hidden = true; });

    menu.querySelectorAll('button[data-lang]').forEach(b => {
      b.addEventListener('click', () => {
        const lang = b.getAttribute('data-lang');
        try { localStorage.setItem(STORAGE_KEY, lang); } catch (_) { /* empty */ }
        try {
          const url = new URL(location.href);
          url.searchParams.delete('lang');
          history.replaceState(null, '', url.toString());
        } catch (_) { /* empty */ }
        location.reload();
      });
    });
  }

  async function bootstrap() {
    const locale = detectLocale();
    const namespaces = getNamespaces();
    const basePath = getBasePath();

    document.documentElement.lang = locale;

    if (!window.i18next) await loadScript(I18NEXT_CDN);
    if (!window.i18nextHttpBackend) await loadScript(BACKEND_CDN);

    await window.i18next.use(window.i18nextHttpBackend).init({
      lng: locale,
      fallbackLng: 'pt-BR',
      ns: namespaces,
      defaultNS: namespaces.find(n => n !== 'common') || 'common',
      backend: { loadPath: `${basePath}/locales/{{lng}}/{{ns}}.json` },
      interpolation: { escapeValue: false },
      load: 'currentOnly',
      partialBundledLanguages: false,
      returnEmptyString: false
    });

    applyTranslations();
    createSwitcher();

    window.EP_I18N = {
      t: (key, opts) => window.i18next.t(key, opts),
      apply: applyTranslations,
      locale: () => window.i18next.language,
      change: async (lng) => {
        await window.i18next.changeLanguage(lng);
        applyTranslations();
      }
    };

    document.dispatchEvent(new Event('ep:i18n-ready'));
    reveal();
  }

  bootstrap().catch(err => {
    console.error('[ep-i18n] init failed:', err);
    reveal();
  });
})();
