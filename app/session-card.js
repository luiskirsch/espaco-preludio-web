// Card de consulta do paciente — usado em home.html e consultas.html.
export const STATUS_LABEL = { scheduled:"Confirmada", completed:"Realizada", canceled:"Cancelada", in_progress:"Em andamento", pending:"Aguardando" };
const STATUS_BADGE = { scheduled:"a-badge--ok", completed:"a-badge--pend", canceled:"a-badge--err", in_progress:"a-badge--ok", pending:"a-badge--warn" };
const STATUS_BAR   = { scheduled:"scheduled", completed:"completed", canceled:"canceled", in_progress:"scheduled", pending:"pending" };

export function esc(s) { return String(s||"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c])); }

export function fmtDt(ms) {
  const d = new Date(Number(ms));
  const weekday = ["Dom","Seg","Ter","Qua","Qui","Sex","Sáb"][d.getDay()];
  const months  = ["jan","fev","mar","abr","mai","jun","jul","ago","set","out","nov","dez"];
  return `${weekday}, ${d.getDate()} de ${months[d.getMonth()]} · ${String(d.getHours()).padStart(2,"0")}:${String(d.getMinutes()).padStart(2,"0")}`;
}

export function countdown(ms) {
  const diff = Number(ms) - Date.now();
  if (diff < 0) return "";
  const h = Math.floor(diff / 3600000);
  const d = Math.floor(h / 24);
  if (d > 0) return `em ${d} dia${d>1?"s":""}`;
  if (h > 0) return `em ${h}h`;
  return "em breve";
}

// Nomes chegam em CAIXA ALTA do cadastro; exibimos em formato de nome.
export function niceName(n) {
  const low = new Set(["da","de","do","das","dos","e"]);
  return String(n||"").toLowerCase().split(/\s+/).filter(Boolean)
    .map((w,i) => i && low.has(w) ? w : w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
}

// Sala liberada: profissional já abriu (in_progress) ou faltam ≤15 min,
// até o fim previsto. Calculado no cliente para o botão surgir na hora certa.
export function canJoin(s) {
  if (!["scheduled", "in_progress"].includes(s.status)) return false;
  const now = Date.now();
  const at = Number(s.scheduledAt);
  const opens = Number(s.joinOpensAt) || at - 15 * 60 * 1000;
  const ends = Number(s.overdueAt) || at + 60 * 60 * 1000;
  if (now >= ends) return false;
  return s.status === "in_progress" || now >= opens;
}
export function isActive(s) {
  if (!["scheduled", "in_progress"].includes(s.status)) return false;
  return Date.now() < (Number(s.overdueAt) || Number(s.scheduledAt) + 60 * 60 * 1000);
}

// opts.summary: versão do Início — sem reagendar/cancelar, com "Ver detalhes".
export function renderCard(s, opts = {}) {
  const status = STATUS_BAR[s.status] || "pending";
  const label = STATUS_LABEL[s.status] || s.status;
  const live = canJoin(s);
  const isUpcoming = isActive(s);
  const cd = isUpcoming && !live ? countdown(s.scheduledAt) : "";
  const d = new Date(Number(s.scheduledAt));
  const wd = ["Dom","Seg","Ter","Qua","Qui","Sex","Sáb"][d.getDay()];
  const mo = ["jan","fev","mar","abr","mai","jun","jul","ago","set","out","nov","dez"][d.getMonth()];
  const hh = `${String(d.getHours()).padStart(2,"0")}:${String(d.getMinutes()).padStart(2,"0")}`;
  const clock = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>';
  const video = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><rect x="3" y="6" width="13" height="12" rx="2"/><path d="m16 10 5-3v10l-5-3"/></svg>';
  return `
    <div class="sess-card sess-card--${status}${live ? " sess-card--live" : ""}">
      <div class="sess-card__main">
        <div class="sess-date" aria-hidden="true">
          <span class="sess-date__wd">${wd}</span>
          <span class="sess-date__d">${d.getDate()}</span>
          <span class="sess-date__m">${mo}</span>
        </div>
        <div class="sess-card__info">
          <span class="sess-status sess-status--${live ? "live" : esc(s.status)}">${esc(live ? (s.status === "in_progress" ? "Profissional na sala" : "Sala aberta") : label)}</span>
          <div class="sess-card__prof">${esc(niceName(s.therapistName) || "Profissional")}</div>
          ${s.especialidade ? `<div class="sess-card__esp">${esc(s.especialidade)}</div>` : ""}
          <div class="sess-card__meta">
            <span class="sess-chip sess-chip--time">${clock}${hh}</span>
            <span class="sess-chip">${video}Videochamada</span>
            ${cd ? `<span class="sess-chip sess-chip--soon">${cd}</span>` : ""}
          </div>
        </div>
      </div>
      ${live ? `
      <div class="sess-card__actions">
        <button type="button" class="a-btn a-btn--sm sess-btn-join" data-join-id="${esc(s.sessionId||s.id||"")}">${video}Entrar na consulta</button>
      </div>` : ""}
      ${isUpcoming && !live && opts.summary ? `
      <div class="sess-card__actions">
        <a href="./consultas.html" class="a-btn a-btn--ghost a-btn--sm">Ver detalhes</a>
      </div>` : ""}
      ${isUpcoming && !live && !opts.summary ? `
      <div class="sess-card__actions">
        <a href="./agendar.html?p=${encodeURIComponent(s.therapistSlug||"")}" class="a-btn a-btn--ghost a-btn--sm">Reagendar</a>
        <button type="button" class="a-btn a-btn--sm sess-btn-cancel" data-cancel-id="${esc(s.sessionId||s.id||"")}">Cancelar</button>
      </div>` : ""}
      ${s.status === "completed" ? `
      <div class="sess-card__actions">
        <a href="./documentos.html" class="a-btn a-btn--ghost a-btn--sm">Ver documentos</a>
        <a href="./buscar.html?p=${encodeURIComponent(s.therapistSlug||"")}" class="a-btn a-btn--ghost a-btn--sm">Repetir consulta</a>
      </div>` : ""}
    </div>`;
}

const JOIN_ERRORS = {
  SALA_AINDA_NAO_DISPONIVEL: "A sala abre 15 minutos antes do horário.",
  SESSAO_EXPIRADA: "O horário desta consulta já terminou.",
  SESSAO_CANCELADA: "Esta consulta foi cancelada.",
  SESSAO_ENCERRADA: "Esta consulta já foi encerrada."
};
export async function joinSession(btn, { auth, backendUrl, onError } = {}) {
  const label = btn.innerHTML;
  btn.disabled = true;
  btn.textContent = "Abrindo a sala…";
  try {
    const token = await auth.currentUser.getIdToken();
    const r = await fetch(`${backendUrl}/therapy/paciente/sessoes/${encodeURIComponent(btn.dataset.joinId)}/join-link`, {
      method: "POST", headers: { Authorization: `Bearer ${token}` }
    });
    const d = await r.json().catch(() => ({}));
    if (!r.ok || !d.joinUrl) throw new Error(d.error || "ERRO");
    location.href = d.joinUrl;
  } catch (e) {
    btn.disabled = false;
    btn.innerHTML = label;
    alert(JOIN_ERRORS[e.message] || "Não foi possível abrir a sala. Tente novamente.");
    onError?.();
  }
}
