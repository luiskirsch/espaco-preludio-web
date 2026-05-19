// Espaço Prelúdio — monitoramento + banner de degradação.
//
// Responsabilidades:
//   1. Detectar falhas consecutivas de fetch contra o backend Railway.
//      Após 3 falhas seguidas, mostra banner amarelo no topo da página.
//   2. Enquanto banner ativo, polla /health a cada 30s pra esconder quando
//      o backend voltar.
//   3. Carregar Sentry browser SDK (se DSN configurado em window.EP_SENTRY_DSN).
//
// Detecção: monkey-patch em window.fetch. Filtra só requests pro domínio
// do backend (railway.app) — não interfere com Firebase Auth, fonts, etc.
//
// Carregado como <script defer> no <head> de todas as páginas autenticadas
// e públicas que dependem do backend (login, cadastro, painel, etc).

(function () {
  if (typeof window === 'undefined') return;
  if (window.EP_MONITORING_LOADED) return;
  window.EP_MONITORING_LOADED = true;

  const FAIL_THRESHOLD = 3;
  const RECOVERY_POLL_MS = 30_000;
  const STATUS_URL = 'https://status.espacopreludio.com.br'; // placeholder, ajustar quando Instatus rodar

  // Backend matching: railway.app cobre staging + production do projeto.
  // Se algum dia migrar pra outro provider, atualizar este pattern.
  function isBackendUrl(url) {
    if (!url) return false;
    return /\.railway\.app(\/|$)/.test(String(url));
  }

  // ─── Banner ──────────────────────────────────────────────────────────
  function ensureBanner() {
    if (document.getElementById('ep-status-banner')) return;
    const div = document.createElement('div');
    div.id = 'ep-status-banner';
    div.setAttribute('role', 'status');
    div.setAttribute('aria-live', 'polite');
    div.innerHTML =
      '<span data-i18n="common:statusBanner.text">Estamos com instabilidade no servidor. Algumas funções podem não responder. Tente novamente em alguns minutos.</span> ' +
      '<a href="' + STATUS_URL + '" target="_blank" rel="noopener" data-i18n="common:statusBanner.link">Ver status</a>';
    (document.body || document.documentElement).appendChild(div);
    if (window.EP_I18N && window.EP_I18N.apply) {
      try { window.EP_I18N.apply(div); } catch (_) { /* empty */ }
    }
  }
  function showBanner() {
    ensureBanner();
    document.documentElement.classList.add('ep-degraded');
  }
  function hideBanner() {
    document.documentElement.classList.remove('ep-degraded');
  }

  // ─── Fetch interception ──────────────────────────────────────────────
  let consecutiveFails = 0;
  let recoveryInterval = null;
  let lastHealthUrl = null;

  const origFetch = window.fetch ? window.fetch.bind(window) : null;
  if (!origFetch) return;

  window.fetch = function (input, init) {
    const url = typeof input === 'string' ? input : (input && input.url) || '';
    if (!isBackendUrl(url)) return origFetch(input, init);

    // Lembra o domínio backend pra poder pollar /health depois sem hardcode.
    if (!lastHealthUrl) {
      try {
        const u = new URL(url);
        lastHealthUrl = u.origin + '/health';
      } catch (_) { /* empty */ }
    }

    return origFetch(input, init).then(function (res) {
      // 2xx-4xx = backend respondeu (mesmo que com erro de aplicação, não é
      // outage). 5xx = erro server, conta como falha.
      if (res.status < 500) {
        if (consecutiveFails > 0) {
          consecutiveFails = 0;
          hideBanner();
          stopRecoveryPoll();
        }
      } else {
        consecutiveFails++;
        if (consecutiveFails >= FAIL_THRESHOLD) {
          showBanner();
          startRecoveryPoll();
        }
      }
      return res;
    }).catch(function (err) {
      // Network error genuíno: CORS block (preflight), timeout, DNS, offline.
      consecutiveFails++;
      if (consecutiveFails >= FAIL_THRESHOLD) {
        showBanner();
        startRecoveryPoll();
      }
      throw err;
    });
  };

  function startRecoveryPoll() {
    if (recoveryInterval) return;
    recoveryInterval = setInterval(async function () {
      if (!lastHealthUrl) return;
      try {
        const res = await origFetch(lastHealthUrl, { method: 'GET', cache: 'no-store' });
        if (res.ok) {
          consecutiveFails = 0;
          hideBanner();
          stopRecoveryPoll();
        }
      } catch (_) { /* still down */ }
    }, RECOVERY_POLL_MS);
  }
  function stopRecoveryPoll() {
    if (recoveryInterval) {
      clearInterval(recoveryInterval);
      recoveryInterval = null;
    }
  }

  // ─── Sentry browser SDK (lazy, se DSN configurado) ───────────────────
  // Coloca window.EP_SENTRY_DSN = "https://..." num <script inline> antes
  // deste arquivo, ou no firebase-config.js. DSN do Sentry é público =
  // safe pra committar em frontend code.
  if (window.EP_SENTRY_DSN) {
    const s = document.createElement('script');
    s.src = 'https://browser.sentry-cdn.com/8.0.0/bundle.min.js';
    s.crossOrigin = 'anonymous';
    s.async = true;
    s.onload = function () {
      try {
        if (window.Sentry && window.Sentry.init) {
          window.Sentry.init({
            dsn: window.EP_SENTRY_DSN,
            environment: window.EP_SENTRY_ENV || (location.hostname === 'espacopreludio.com.br' && !location.pathname.startsWith('/staging') ? 'production' : 'staging'),
            tracesSampleRate: 0,
            ignoreErrors: [
              'ResizeObserver loop limit exceeded',
              'ResizeObserver loop completed with undelivered notifications',
              /Failed to fetch/i,
              /NetworkError/i,
              /Load failed/i
            ]
          });
        }
      } catch (_) { /* empty */ }
    };
    document.head.appendChild(s);
  }
})();
