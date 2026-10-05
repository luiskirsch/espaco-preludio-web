// Portal responsivo do colaborador: preserva a navegação móvel e cria uma
// experiência institucional completa em telas maiores.
(function enhanceCollaboratorPortal() {
  const currentFile = (location.pathname.split("/").pop() || "home.html").toLowerCase();
  const route = currentFile.replace(/\.html$/, "") || "home";
  document.body.classList.add("a-portal-authenticated", `a-route-${route}`);

  const nav = document.querySelector(".a-nav") || document.createElement("nav");
  nav.className = "a-nav";
  nav.setAttribute("aria-label", "Navegação do colaborador");

  const items = [
    { file: "home.html", label: "Início", icon: '<path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/>' },
    { file: "buscar.html", label: "Buscar profissional", icon: '<circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>' },
    { file: "consultas.html", label: "Minhas consultas", icon: '<rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>' },

    { file: "jornada.html", label: "Minha jornada", secondary: true, icon: '<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/><path d="M9 7h7M9 11h5"/>' },
    { file: "nr1.html", label: "Pesquisas do trabalho", secondary: true, icon: '<path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>' },
    { file: "chat.html", label: "Mensagens", secondary: true, icon: '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>' },
    { file: "documentos.html", label: "Documentos", secondary: true, icon: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="8" y1="13" x2="16" y2="13"/><line x1="8" y1="17" x2="16" y2="17"/>' },
    { file: "perfil.html", label: "Meu perfil", icon: '<path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>' }
  ];

  const activeFile = route === "agendar" ? "buscar.html" : currentFile;
  const links = items.map((item) => {
    const active = item.file === activeFile;
    return `<a href="./${item.file}" class="a-nav__item${active ? " is-active" : ""}${item.secondary ? " a-nav__item--secondary" : ""}"${active ? ' aria-current="page"' : ""}>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${item.icon}</svg>
      <span>${item.label}</span>
      ${active ? '<span class="a-nav__dot" aria-hidden="true"></span>' : ""}
    </a>`;
  }).join("");

  nav.innerHTML = `
    <a class="a-nav__brand" href="./home.html" aria-label="Espaço Prelúdio — início">
      <img src="/logo_oficial_fundo_transparente.png?v=2" alt="">
      <span><strong>Espaço Prelúdio</strong><small>Portal do colaborador</small></span>
    </a>
    <div class="a-nav__caption">Seu espaço de cuidado</div>
    <div class="a-nav__links">${links}</div>
    <div class="a-nav__meta">
      <a class="a-nav__urgent" href="./emergencia.html"><strong>Ajuda imediata</strong><span>Telefones e orientação de emergência</span></a>
      <span><i aria-hidden="true"></i> Ambiente protegido</span>
      <small>Seu cuidado é confidencial e seus dados clínicos não são compartilhados com a empresa.</small>
      <a href="../politica.html">Privacidade e segurança</a>
    </div>`;

  if (!nav.isConnected) document.querySelector(".a-shell")?.appendChild(nav);

  // Navegação instantânea: ao parar o mouse num item do menu (ou tocar nele),
  // o navegador já abre a página escondida — login, dados e tudo — e a troca
  // é imediata, já atualizada. Só páginas cuja abertura apenas LÊ dados
  // (sem efeitos colaterais) são pré-renderizadas; as demais só pré-buscam.
  if (HTMLScriptElement.supports?.("speculationrules") && !document.querySelector("script[data-ep-speculation]")) {
    const safe = ["home", "buscar", "consultas", "jornada", "humor", "documentos", "perfil"]
      .filter(name => name !== route)
      .map(name => ({ href_matches: { pathname: `{/staging}?/app/${name}.html` } }));
    const rules = document.createElement("script");
    rules.type = "speculationrules";
    rules.dataset.epSpeculation = "";
    rules.textContent = JSON.stringify({
      // "immediate": as páginas do menu ficam prontas logo que o portal abre.
      prerender: [{ source: "document", where: { or: safe }, eagerness: "immediate" }],
      prefetch: [{ source: "document", where: { href_matches: { pathname: "{/staging}?/app/*.html" } }, eagerness: "moderate" }]
    });
    document.head.append(rules);
  }

  // Página pré-renderizada há muito tempo, ou com dados alterados por outra
  // página depois que nasceu (ex.: humor registrado no início): atualiza ao
  // ser aberta para nunca mostrar dado velho. Quem grava marca "ep:dirtyAt".
  if (document.prerendering) {
    const bornAt = Date.now();
    document.addEventListener("prerenderingchange", () => {
      let dirtyAt = 0;
      try { dirtyAt = Number(localStorage.getItem("ep:dirtyAt")) || 0; } catch {}
      if (Date.now() - bornAt > 3 * 60 * 1000 || dirtyAt > bornAt) location.reload();
    }, { once: true });
  }
})();
