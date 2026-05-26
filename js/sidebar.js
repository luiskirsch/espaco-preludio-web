// Sidebar premium do produto profissional — single source of truth.
// Cada página logged-in só precisa de:
//   1. <body class="ep-has-sidebar"> (pra CSS aplicar layout sem FOUC)
//   2. <script src="./js/sidebar.js?v=N" defer></script>
// O script injeta o <aside> no início do body, marca link ativo pelo
// pathname, e sincroniza avatar/nome/TISS do topbar (Firebase logic vive
// em auth-guard.js → topUserName / topUserAvatar).
(function () {
  if (document.querySelector('.ep-sidebar')) return;

  const ICONS = {
    video: '<path d="M23 7l-7 5 7 5V7z"/><rect x="1" y="5" width="15" height="14" rx="2"/>',
    calendar: '<rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>',
    users: '<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/>',
    fileText: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/>',
    dollar: '<line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>',
    barChart: '<line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/>',
    building: '<rect x="4" y="2" width="16" height="20" rx="2"/><line x1="9" y1="8" x2="15" y2="8"/><line x1="12" y1="6" x2="12" y2="11"/>',
    package: '<path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/>',
    msg: '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>',
    megaphone: '<path d="M3 11l18-5v12L3 14v-3z"/><path d="M11.6 16.8a3 3 0 1 1-5.8-1.6"/>',
    chat: '<path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/>'
  };

  function svg(key) {
    return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">' + ICONS[key] + '</svg>';
  }
  function item(href, icon, label, i18n, extra) {
    return '<a href="./' + href + '" ' + (extra || '') + '>' + svg(icon) + '<span data-i18n="' + i18n + '">' + label + '</span></a>';
  }

  // Preflight do TISS: lê cache do profile (capability-preflight grava
  // sessionStorage["ep:profile:v2"]). Se tissEnabled, sidebar já nasce
  // com TISS VISÍVEL pre-paint — sem o "is-hidden" inicial. Elimina o
  // flicker de "TISS some/aparece" a cada navegação entre páginas.
  // Sem cache (1ª visita), começa hidden e syncTiss revela quando o
  // auth-guard async termina.
  var tissCachedEnabled = false;
  try {
    var profileRaw = sessionStorage.getItem('ep:profile:v2');
    if (profileRaw) {
      var profileEntry = JSON.parse(profileRaw);
      tissCachedEnabled = !!(profileEntry && profileEntry.profile && profileEntry.profile.therapist && profileEntry.profile.therapist.tissEnabled);
    }
  } catch (e) { /* sem cache, mantém hidden */ }
  var tissExtra = 'id="sidebarTissLink" class="ep-sidebar__tiss' + (tissCachedEnabled ? '' : ' is-hidden') + '"';

  // i18n keys vivem em common.json (sempre carregado) — namespace `painel`
  // só existe em painel.html, então usá-lo aqui quebra o menu em todas as
  // outras páginas (i18next devolve key parcial e o init substitui textContent).
  const NAV = [
    { labelKey: 'common:sidebar.groupClinico', label: 'Clínico', items: [
      ['painel.html', 'video', 'Consultas', 'common:sidebar.consultas'],
      ['agenda.html', 'calendar', 'Agenda', 'common:sidebar.agenda'],
      ['pacientes.html', 'users', 'Pacientes', 'common:sidebar.pacientes'],
      ['tiss.html', 'fileText', 'TISS', 'common:sidebar.tiss', tissExtra]
    ]},
    { labelKey: 'common:sidebar.groupGestao', label: 'Gestão', items: [
      ['financeiro.html', 'dollar', 'Financeiro', 'common:sidebar.financeiro'],
      ['relatorios.html', 'barChart', 'Relatórios', 'common:sidebar.relatorios'],
      ['clinica.html', 'building', 'Clínica', 'common:sidebar.clinica'],
      ['inventario.html', 'package', 'Estoque', 'common:sidebar.estoque']
    ]},
    { labelKey: 'common:sidebar.groupEngajamento', label: 'Engajamento', items: [
      ['mensagens-pro.html', 'msg', 'Colegas', 'common:sidebar.colegas'],
      ['marketing.html', 'megaphone', 'Marketing', 'common:sidebar.marketing'],
      ['whatsapp.html', 'chat', 'WhatsApp', 'common:sidebar.whatsapp']
    ]}
  ];

  const navHTML = NAV.map(function (g) {
    return '<div class="ep-sidebar__group">' +
      '<div class="ep-sidebar__group-label" data-i18n="' + g.labelKey + '">' + g.label + '</div>' +
      g.items.map(function (i) { return item(i[0], i[1], i[2], i[3], i[4]); }).join('') +
      '</div>';
  }).join('');

  const html =
    '<aside class="ep-sidebar" aria-label="Menu principal">' +
      '<a class="ep-sidebar__brand" href="./painel.html" aria-label="Espaço Prelúdio">' +
        '<span class="ep-brand__mark"></span>' +
        '<span class="ep-brand__name">' +
          '<span class="ep-brand__lead" data-i18n="common:brand.lead">Espaço</span>' +
          '<span data-i18n="common:brand.tail">Prelúdio</span>' +
        '</span>' +
      '</a>' +
      '<nav class="ep-sidebar__nav">' + navHTML + '</nav>' +
      '<div class="ep-sidebar__footer">' +
        '<a href="./perfil.html" class="ep-sidebar__profile" id="sidebarProfileLink">' +
          '<span class="ep-nav-avatar" id="sidebarUserAvatar">·</span>' +
          '<span class="ep-sidebar__profile-name" id="sidebarUserName"></span>' +
        '</a>' +
        '<button id="sidebarLogout" type="button" class="ep-btn ep-btn--ghost ep-btn--sm" data-i18n="common:sidebar.logout">Sair</button>' +
      '</div>' +
    '</aside>';

  document.body.classList.add('ep-has-sidebar');
  document.body.insertAdjacentHTML('afterbegin', html);

  // INLINE-STYLE FORCE — aplica via JS pra vencer cache de CSS antigo
  // que pode estar servindo regras com flex:1 no nav (esticava e colava
  // o footer). Inline-style vence qualquer regra CSS sem !important.
  var navEl = document.querySelector('.ep-sidebar__nav');
  var footerEl = document.querySelector('.ep-sidebar__footer');
  if (navEl) {
    navEl.style.flex = '0 0 auto';
    navEl.style.minHeight = 'auto';
  }
  if (footerEl) {
    footerEl.style.marginTop = 'auto';
  }

  // Marca link ativo pelo pathname (basename do URL).
  const path = (window.location.pathname.split('/').pop() || 'painel.html').toLowerCase();
  document.querySelectorAll('.ep-sidebar__nav a').forEach(function (a) {
    const href = (a.getAttribute('href') || '').replace(/^\.?\//, '').toLowerCase();
    if (href === path) a.classList.add('is-active');
  });

  // Sync avatar/nome/TISS do topbar — auth-guard.js seta foto base64,
  // selo verificado (innerHTML) e iniciais (textContent). Replicamos tudo
  // via MutationObserver pra reatividade quando Firebase emite mudança.
  const topName = document.getElementById('topUserName');
  const sideName = document.getElementById('sidebarUserName');
  const topAvatar = document.getElementById('topUserAvatar');
  const sideAvatar = document.getElementById('sidebarUserAvatar');

  function syncName() {
    if (!topName || !sideName) return;
    const parts = (topName.textContent || '').trim().split(/\s+/).filter(Boolean);
    const first = parts[0] || 'Perfil';
    const last = parts.length > 1 ? parts[parts.length - 1] : '';
    sideName.innerHTML = last
      ? '<span>' + first + '</span><span>' + last + '</span>'
      : '<span>' + first + '</span>';
  }
  function syncAvatar() {
    if (!topAvatar || !sideAvatar) return;
    sideAvatar.style.backgroundImage = topAvatar.style.backgroundImage;
    sideAvatar.style.backgroundSize = topAvatar.style.backgroundSize || 'cover';
    sideAvatar.style.backgroundPosition = topAvatar.style.backgroundPosition || 'center';
    sideAvatar.innerHTML = topAvatar.innerHTML;
    if (topAvatar.classList.contains('ep-avatar-wrap')) sideAvatar.classList.add('ep-avatar-wrap');
  }

  if (topName) new MutationObserver(syncName).observe(topName, { childList: true, characterData: true, subtree: true });
  if (topAvatar) new MutationObserver(syncAvatar).observe(topAvatar, {
    childList: true, characterData: true, subtree: true,
    attributes: true, attributeFilter: ['style', 'class']
  });
  syncName();
  syncAvatar();

  // TISS link visibility — fonte da verdade é o COMPUTED style do topbar
  // (não o inline). HTML estático tem `style="display:none"` inline em
  // [data-tiss-only]; capability-preflight aplica CSS `display:inline-block
  // !important` quando tissEnabled, que sobrescreve VISUALMENTE mas deixa
  // o inline intacto. Checar `.style.display` direto retornaria "none"
  // (errado) e esconderia o sidebar TISS por ~100-500ms até auth-guard
  // async sobrescrever o inline → flicker "TISS some/volta" a cada nav.
  // getComputedStyle considera tanto inline quanto CSS com !important.
  const topTiss = document.querySelector('header.ep-topbar [data-tiss-only]');
  const sideTiss = document.getElementById('sidebarTissLink');
  if (topTiss && sideTiss) {
    const syncTiss = function () {
      const hidden = window.getComputedStyle(topTiss).display === 'none';
      sideTiss.classList.toggle('is-hidden', hidden);
    };
    // Observa style inline (auth-guard mexe lá) E também atributos style/class
    // do html (caso preflight troque <style> tag).
    new MutationObserver(syncTiss).observe(topTiss, { attributes: true, attributeFilter: ['style', 'class'] });
    syncTiss();
  }

  // Logout encaminha pro handler original (Firebase signOut em auth-guard)
  const sideLogout = document.getElementById('sidebarLogout');
  const topLogout = document.getElementById('logoutBtn');
  if (sideLogout && topLogout) {
    sideLogout.addEventListener('click', function () { topLogout.click(); });
  }

  // Re-aplica traduções no sidebar: como i18next boota async (CDN),
  // ele pode ter rodado applyTranslations antes do aside existir. Ouvimos
  // `ep:i18n-ready` (disparado uma vez no boot) e também tentamos imediato
  // caso já esteja pronto.
  const sideEl = document.querySelector('.ep-sidebar');
  function applyToSidebar() {
    if (window.EP_I18N && window.EP_I18N.apply && sideEl) window.EP_I18N.apply(sideEl);
  }
  if (window.EP_I18N) applyToSidebar();
  document.addEventListener('ep:i18n-ready', applyToSidebar);

  // FAB stack — container flex que agrupa todos os botões flutuantes
  // (theme/msg/help/logout) e centraliza verticalmente como BLOCO. Resolve
  // o caos das regras body:has(...) que mudavam bottom conforme quais
  // FABs existiam. Auth-guard monta os FABs async, então usamos
  // MutationObserver pra mover qualquer FAB novo pra cá. Em mobile
  // (sem sidebar), o stack vira display:contents e FABs voltam ao fluxo.
  (function setupFabStack() {
    if (document.querySelector('.ep-fab-stack')) return;
    const stack = document.createElement('div');
    stack.className = 'ep-fab-stack';
    document.body.appendChild(stack);
    const SELECTORS = '.ep-theme-toggle, .ep-msg-bubble-fab, .ep-help-bubble, .ep-logout-fab';
    function collect() {
      document.querySelectorAll(SELECTORS).forEach(el => {
        if (el.parentNode !== stack) stack.appendChild(el);
      });
    }
    collect();
    new MutationObserver(collect).observe(document.body, { childList: true });
  })();
})();
