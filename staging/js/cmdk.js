// Espaço Prelúdio — busca global (Cmd+K / Ctrl+K).
// Overlay com input + lista filtrável. v1: navegação rápida entre páginas.
// Mounta lazy no 1º atalho — não pesa nas páginas que não usam.

const PAGES = [
  { label: "Painel",        sub: "Próximas sessões e atalhos",        href: "./painel.html" },
  { label: "Pacientes",     sub: "Cadastro e prontuário",             href: "./pacientes.html" },
  { label: "Agenda",        sub: "Sua agenda e disponibilidade",      href: "./agenda.html" },
  { label: "Financeiro",    sub: "Lançamentos, recibos, export",      href: "./financeiro.html" },
  { label: "Relatórios",    sub: "Analytics, NPS, KPIs",              href: "./relatorios.html" },
  { label: "Documentos",    sub: "Modelos de declarações e laudos",   href: "./documento.html", capability: "documentos-clinicos" },
  { label: "Receita",       sub: "Emissão de receita médica",         href: "./receita.html",   capability: "receita" },
  { label: "Calculadora",   sub: "Calculadoras clínicas",             href: "./calculadora.html", capability: "calculadora-clinica" },
  { label: "Diretório",     sub: "Como aparece no diretório público", href: "./profissionais.html" },
  { label: "Perfil",        sub: "Dados, conselho, foto, 2FA",        href: "./perfil.html" },
  { label: "Plano",         sub: "Sua assinatura e cobrança",         href: "./planos.html" },
  { label: "Suporte",       sub: "Central de ajuda",                  href: "./suporte.html" }
];

let mounted = false;
let overlay, input, list;
let visiblePages = [];
let activeIdx = 0;

function ensureMounted() {
  if (mounted) return;
  mounted = true;
  overlay = document.createElement("div");
  overlay.className = "ep-cmdk-overlay";
  overlay.setAttribute("role", "dialog");
  overlay.setAttribute("aria-modal", "true");
  overlay.innerHTML = `
    <div class="ep-cmdk-panel">
      <div class="ep-cmdk-search">
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="11" cy="11" r="7"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
        <input type="text" id="epCmdkInput" placeholder="Buscar páginas… (esc pra fechar)" autocomplete="off" spellcheck="false">
        <span class="ep-cmdk-kbd">esc</span>
      </div>
      <ul class="ep-cmdk-list" id="epCmdkList" role="listbox"></ul>
      <div class="ep-cmdk-footer">
        <span><kbd>↑</kbd><kbd>↓</kbd> navegar</span>
        <span><kbd>enter</kbd> abrir</span>
        <span><kbd>esc</kbd> fechar</span>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);
  input = overlay.querySelector("#epCmdkInput");
  list  = overlay.querySelector("#epCmdkList");

  overlay.addEventListener("click", (e) => { if (e.target === overlay) close(); });
  input.addEventListener("input", () => { render(input.value); });
  input.addEventListener("keydown", (e) => {
    if (e.key === "ArrowDown") { e.preventDefault(); activeIdx = Math.min(activeIdx + 1, visiblePages.length - 1); highlight(); }
    else if (e.key === "ArrowUp") { e.preventDefault(); activeIdx = Math.max(activeIdx - 1, 0); highlight(); }
    else if (e.key === "Enter") { e.preventDefault(); go(visiblePages[activeIdx]); }
    else if (e.key === "Escape") { e.preventDefault(); close(); }
  });
  list.addEventListener("click", (e) => {
    const li = e.target.closest("li[data-i]");
    if (!li) return;
    go(visiblePages[Number(li.getAttribute("data-i"))]);
  });
}

function getAllowedPages() {
  // Espelha capability visibility já aplicada pelo auth-guard. Páginas escondidas
  // por capability (perfis sem aquela permissão) somem da busca também.
  return PAGES.filter(p => {
    if (!p.capability) return true;
    const link = document.querySelector(`a[href*="${p.href.replace("./", "")}"]`);
    return !link || link.style.display !== "none";
  });
}

function render(query) {
  const q = (query || "").trim().toLowerCase();
  const pool = getAllowedPages();
  visiblePages = q
    ? pool.filter(p => p.label.toLowerCase().includes(q) || p.sub.toLowerCase().includes(q))
    : pool;
  activeIdx = 0;
  list.innerHTML = visiblePages.map((p, i) => `
    <li data-i="${i}" role="option" class="${i === 0 ? "is-active" : ""}">
      <div class="ep-cmdk-item">
        <div class="ep-cmdk-item__title">${escapeHtml(p.label)}</div>
        <div class="ep-cmdk-item__sub">${escapeHtml(p.sub)}</div>
      </div>
      <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M9 18l6-6-6-6"/></svg>
    </li>
  `).join("") || `<li class="ep-cmdk-empty">Nada encontrado</li>`;
}

function highlight() {
  list.querySelectorAll("li[data-i]").forEach((li, i) => {
    li.classList.toggle("is-active", i === activeIdx);
  });
  const active = list.querySelector("li.is-active");
  if (active) active.scrollIntoView({ block: "nearest" });
}

function go(p) {
  if (!p) return;
  close();
  window.location.href = p.href;
}

function escapeHtml(s) {
  return String(s == null ? "" : s).replace(/[&<>"']/g, c =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" }[c]));
}

export function open() {
  ensureMounted();
  overlay.classList.add("is-open");
  input.value = "";
  render("");
  setTimeout(() => input.focus(), 30);
}

export function close() {
  if (!overlay) return;
  overlay.classList.remove("is-open");
}

// Auto-registra listener global. Cmd+K (Mac) ou Ctrl+K.
// Skip em consultorio.html — durante video-chamada o overlay atrapalha.
// Skip tambem se foco esta em input de texto (e.target).
if (typeof document !== "undefined") {
  const isConsultorio = location.pathname.toLowerCase().includes("/consultorio.html");
  if (!isConsultorio) {
    document.addEventListener("keydown", (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        // Skip se ja esta em campo de texto editavel (deixa Ctrl+K do browser passar)
        const tag = (e.target?.tagName || "").toUpperCase();
        if (tag === "INPUT" || tag === "TEXTAREA" || e.target?.isContentEditable) return;
        e.preventDefault();
        open();
      }
    });
  }
}
