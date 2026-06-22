/**
 * admin-sidebar.js — sidebar injetado em todas as páginas admin.
 * Substitui o topbar horizontal por um sidebar fixo à esquerda.
 * Inclua este script no início do <body> de cada página admin.
 */
(function () {
  // ─── CSS ────────────────────────────────────────────────────────────────
  const style = document.createElement("style");
  style.textContent = `
    :root { --ep-admin-sb-w: 220px; }

    #epAdminSidebar {
      position: fixed; left: 0; top: 0; bottom: 0;
      width: var(--ep-admin-sb-w);
      background: var(--ep-surface);
      border-right: 1px solid var(--ep-line);
      display: flex; flex-direction: column;
      z-index: 60; overflow-y: auto;
      overflow-x: hidden;
      scrollbar-width: thin;
      scrollbar-color: rgba(0,0,0,.1) transparent;
    }
    #epAdminSidebar::-webkit-scrollbar { width: 4px; }
    #epAdminSidebar::-webkit-scrollbar-thumb { background: rgba(0,0,0,.12); border-radius: 4px; }

    .ep-asb__brand {
      display: flex; align-items: center; gap: 10px;
      padding: 18px 16px 14px;
      text-decoration: none;
      border-bottom: 1px solid var(--ep-line);
      flex-shrink: 0;
    }
    .ep-asb__brand-mark {
      width: 32px; height: 32px; border-radius: 8px;
      background: var(--ep-ink); color: var(--ep-bg);
      display: grid; place-items: center;
      font-family: 'Fraunces', Georgia, serif;
      font-size: 13px; font-weight: 600; flex-shrink: 0;
    }
    .ep-asb__brand-name { line-height: 1.2; }
    .ep-asb__brand-lead { display: block; font-size: 10px; font-weight: 600; letter-spacing: .04em; color: var(--ep-ink-3); text-transform: uppercase; }
    .ep-asb__brand-tail { display: block; font-size: 13px; font-weight: 600; color: var(--ep-ink); }

    .ep-asb__nav { flex: 1; padding: 10px 0; }

    .ep-asb__section {
      font-size: 9.5px; font-weight: 700; letter-spacing: .08em;
      text-transform: uppercase; color: var(--ep-ink-3);
      padding: 14px 16px 4px; margin-top: 4px;
    }
    .ep-asb__section:first-child { margin-top: 0; }

    .ep-asb__link {
      display: flex; align-items: center; gap: 9px;
      padding: 7px 16px; text-decoration: none;
      color: var(--ep-ink-2); font-size: 13px; font-weight: 500;
      border-radius: 0; transition: background 120ms, color 120ms;
      position: relative;
    }
    .ep-asb__link:hover { background: var(--ep-bg-2); color: var(--ep-ink); }
    .ep-asb__link.is-active {
      background: var(--ep-bg-2); color: var(--ep-accent);
      font-weight: 600;
    }
    .ep-asb__link.is-active::before {
      content: ""; position: absolute; left: 0; top: 4px; bottom: 4px;
      width: 3px; border-radius: 0 3px 3px 0;
      background: var(--ep-accent);
    }
    .ep-asb__link svg { width: 15px; height: 15px; flex-shrink: 0; opacity: .7; }
    .ep-asb__link.is-active svg { opacity: 1; }
    .ep-asb__label { flex: 1; }

    .ep-asb__badge {
      display: inline-flex; align-items: center; justify-content: center;
      min-width: 18px; height: 18px; padding: 0 4px;
      border-radius: 9px; font-size: 10px; font-weight: 700;
      background: #b8453d; color: #fff; line-height: 1;
    }
    .ep-asb__badge.ep-hide { display: none; }
    .ep-asb__badge.is-error { background: var(--ep-ink-3); }

    .ep-asb__foot {
      border-top: 1px solid var(--ep-line);
      padding: 12px 16px; flex-shrink: 0;
    }
    .ep-asb__email {
      font-size: 11px; color: var(--ep-ink-3);
      overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
      margin-bottom: 8px;
    }
    #epAdminLogoutBtn {
      display: flex; align-items: center; gap: 7px;
      width: 100%; padding: 7px 10px; border-radius: 6px;
      border: 1px solid var(--ep-line); background: var(--ep-bg-2);
      color: var(--ep-ink-2); font-size: 12px; font-weight: 500;
      cursor: pointer; font-family: 'Inter', sans-serif;
      transition: background 120ms, color 120ms;
    }
    #epAdminLogoutBtn:hover { background: var(--ep-surface); color: var(--ep-ink); }
    #epAdminLogoutBtn svg { width: 13px; height: 13px; opacity: .7; }

    /* Layout: empurra o conteúdo para a direita */
    body.ep-admin-has-sidebar .ep-topbar { display: none !important; }
    body.ep-admin-has-sidebar .ep-shell { padding-left: var(--ep-admin-sb-w); min-height: 100vh; }
    body.ep-admin-has-sidebar .ep-main { min-height: 100vh; }

    /* Oculta language toggle e ep-logout-fab em páginas admin */
    #ep-lang-switcher, #ep-trust-lang-slot { display: none !important; }
    body.ep-admin-has-sidebar .ep-logout-fab { display: none !important; }

    /* Cápsula flutuante de Sair — canto inferior direito */
    #epAdminSairFloat {
      position: fixed; bottom: 20px; right: 20px; z-index: 200;
      display: flex; align-items: center; gap: 6px;
      padding: 7px 14px; border-radius: 999px;
      background: var(--ep-surface); border: 1px solid var(--ep-line);
      color: var(--ep-ink-2); font-family: 'Inter', sans-serif;
      font-size: 12px; font-weight: 500; cursor: pointer;
      box-shadow: 0 2px 12px rgba(0,0,0,.1);
      transition: background 120ms, color 120ms, box-shadow 120ms;
    }
    #epAdminSairFloat:hover {
      background: var(--ep-bg-2); color: var(--ep-ink);
      box-shadow: 0 4px 16px rgba(0,0,0,.15);
    }
    #epAdminSairFloat svg { width: 13px; height: 13px; opacity: .7; }

    @media (max-width: 860px) {
      :root { --ep-admin-sb-w: 48px; }
      .ep-asb__brand-name, .ep-asb__section, .ep-asb__label { display: none; }
      .ep-asb__brand { padding: 14px 8px; justify-content: center; }
      .ep-asb__link { padding: 10px; justify-content: center; }
      .ep-asb__link::before { display: none; }
      .ep-asb__foot { padding: 10px 6px; }
      .ep-asb__email { display: none; }
      #epAdminLogoutBtn { padding: 8px; justify-content: center; }
      #epAdminLogoutBtn span { display: none; }
      #epAdminSairFloat { bottom: 12px; right: 12px; padding: 7px 10px; }
      #epAdminSairFloat span { display: none; }
    }
  `;
  document.head.appendChild(style);

  // ─── SVG icons ─────────────────────────────────────────────────────────
  const icons = {
    grid:    `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></svg>`,
    users:   `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>`,
    user:    `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>`,
    flag:    `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/><line x1="4" y1="22" x2="4" y2="15"/></svg>`,
    shield:  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>`,
    book:    `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>`,
    clock:   `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>`,
    file:    `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>`,
    star:    `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>`,
    building:`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="3" width="20" height="14" rx="2"/><polyline points="8 21 12 17 16 21"/><path d="M7 8h1M11 8h1M15 8h1M7 12h1M11 12h1M15 12h1"/></svg>`,
    briefcase:`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2"/><line x1="12" y1="12" x2="12" y2="12"/></svg>`,
    check:   `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>`,
    grad:    `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 10v6M2 10l10-5 10 5-10 5z"/><path d="M6 12v5c3 3 9 3 12 0v-5"/></svg>`,
    logout:  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>`
  };

  // ─── Nav structure ──────────────────────────────────────────────────────
  const NAV = [
    { section: "Principal" },
    { href: "admin-painel.html",      label: "Painel",           icon: "grid"      },

    { section: "Profissionais" },
    { href: "admin-profissionais.html", label: "Profissionais",  icon: "users"     },
    { href: "admin-pacientes.html",   label: "Pacientes",        icon: "user"      },
    { href: "admin-denuncias.html",   label: "Denúncias",        icon: "flag"      },

    { section: "Revisões" },
    { href: "admin-verificacoes.html",          label: "CRP/CRM",       icon: "shield",    badgeId: "navBadgeCrpCrm"       },
    { href: "admin-comprovantes.html",           label: "Estudante",     icon: "book",      badgeId: "navBadgeEstudante"    },
    { href: "admin-comprovantes-recem-formado.html", label: "Recém-formado", icon: "clock", badgeId: "navBadgeRecemFormado" },
    { href: "admin-comprovantes-formacao.html",  label: "Sem conselho",  icon: "file",      badgeId: "navBadgeSemConselho"  },
    { href: "admin-leads-estudante.html",        label: "Leads Estudante", icon: "star",    badgeId: "navBadgeLeadsEstudante"},

    { section: "B2B / Empresas" },
    { href: "admin-empresas.html",      label: "Empresas",       icon: "building"   },
    { href: "admin-colaboradores.html", label: "Colaboradores",  icon: "briefcase"  },
    { href: "admin-empresa.html",       label: "Aprovações",     icon: "check",     badgeId: "navBadgeEmpresa" },

    { section: "Municipal" },
    { href: "admin-estudantes.html",    label: "Estudantes",     icon: "grad"       },
  ];

  // ─── Active detection ───────────────────────────────────────────────────
  function isActive(href) {
    const current = location.pathname.split("/").pop() || "admin-painel.html";
    return current === href || location.pathname.endsWith("/" + href);
  }

  // ─── Build HTML ─────────────────────────────────────────────────────────
  function buildSidebar() {
    const sb = document.createElement("div");
    sb.id = "epAdminSidebar";

    // Brand
    sb.innerHTML = `
      <a href="./admin-painel.html" class="ep-asb__brand" aria-label="Admin">
        <span class="ep-asb__brand-mark">EP</span>
        <span class="ep-asb__brand-name">
          <span class="ep-asb__brand-lead">Espaço Prelúdio</span>
          <span class="ep-asb__brand-tail">Admin</span>
        </span>
      </a>
    `;

    // Nav
    const nav = document.createElement("nav");
    nav.className = "ep-asb__nav";

    for (const item of NAV) {
      if (item.section) {
        const s = document.createElement("div");
        s.className = "ep-asb__section";
        s.textContent = item.section;
        nav.appendChild(s);
        continue;
      }
      const a = document.createElement("a");
      a.href = "./" + item.href;
      a.className = "ep-asb__link" + (isActive(item.href) ? " is-active" : "");
      a.innerHTML = `
        ${icons[item.icon] || ""}
        <span class="ep-asb__label">${item.label}</span>
        ${item.badgeId ? `<span class="ep-asb__badge ep-hide" id="${item.badgeId}">0</span>` : ""}
      `;
      nav.appendChild(a);
    }
    sb.appendChild(nav);

    // Footer — só exibe o e-mail; o botão Sair é o flutuante
    const foot = document.createElement("div");
    foot.className = "ep-asb__foot";
    foot.innerHTML = `<div class="ep-asb__email" id="adminEmail">…</div>`;
    sb.appendChild(foot);

    // Botão oculto — a página JS e o botão flutuante se ligam a ele
    const hiddenLogout = document.createElement("button");
    hiddenLogout.id = "logoutBtn";
    hiddenLogout.type = "button";
    hiddenLogout.style.display = "none";
    sb.appendChild(hiddenLogout);

    return sb;
  }

  // ─── Inject on DOM ready ────────────────────────────────────────────────
  function inject() {
    // Remove topbar nav (keep topbar element for login panel pages)
    const topbarNav = document.querySelector(".ep-topbar .ep-nav");
    if (topbarNav) topbarNav.remove();

    // Remove existing adminEmail and logoutBtn from topbar to avoid duplicate IDs
    ["adminEmail", "logoutBtn", "forbiddenLogout"].forEach(id => {
      const el = document.getElementById(id);
      if (el && el.closest(".ep-topbar")) el.remove();
    });

    // Insert sidebar before ep-shell content
    const sidebar = buildSidebar();
    document.body.appendChild(sidebar);
    document.body.classList.add("ep-admin-has-sidebar");

    // Cápsula flutuante de Sair — canto inferior direito
    const sairFloat = document.createElement("button");
    sairFloat.id = "epAdminSairFloat";
    sairFloat.type = "button";
    sairFloat.innerHTML = `${icons.logout}<span>Sair</span>`;
    sairFloat.addEventListener("click", () => {
      // Aciona o logoutBtn do sidebar (que o JS da página já conectou ao signOut)
      document.getElementById("logoutBtn")?.click();
    });
    document.body.appendChild(sairFloat);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", inject);
  } else {
    inject();
  }
})();
