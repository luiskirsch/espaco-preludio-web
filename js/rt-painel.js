import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";
import { auth, BACKEND_BASE_URL } from "./firebase-config.js";

const state = {
  actor: null,
  dashboard: null,
  professionals: [],
  incidents: [],
  supervisions: [],
  checklist: [],
  incidentFilter: "all"
};

const $ = selector => document.querySelector(selector);
const $$ = selector => [...document.querySelectorAll(selector)];

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>'"]/g, char => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;"
  })[char]);
}

function formatDate(value, withTime = false) {
  if (!value) return "Sem registro";
  const date = new Date(Number(value));
  if (Number.isNaN(date.getTime())) return "Sem registro";
  return new Intl.DateTimeFormat("pt-BR", withTime
    ? { dateStyle: "short", timeStyle: "short" }
    : { dateStyle: "medium" }).format(date);
}

function label(map, key) { return map[key] || key || "—"; }
const statusLabels = { open: "Aberta", monitoring: "Em acompanhamento", resolved: "Resolvida" };
const severityLabels = { low: "Baixa", medium: "Média", high: "Alta", critical: "Crítica" };
const typeLabels = { routine: "Rotina", orientation: "Orientação técnica", training: "Treinamento", audit: "Auditoria", "incident-review": "Revisão de ocorrência", "case-process": "Processo assistencial" };
const cadenceLabels = { monthly: "Mensal", quarterly: "Trimestral", annual: "Anual" };

async function api(path, options = {}) {
  const user = auth.currentUser;
  if (!user) throw new Error("SESSAO_EXPIRADA");
  const token = await user.getIdToken();
  const response = await fetch(`${BACKEND_BASE_URL}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      ...(options.headers || {})
    }
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error || "ERRO_NA_SOLICITACAO");
  return body;
}

function showToast(text, error = false) {
  const toast = $("#rtToast");
  toast.textContent = text;
  toast.classList.toggle("is-error", error);
  toast.classList.add("is-visible");
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => toast.classList.remove("is-visible"), 3500);
}

function initials(name) {
  return String(name || "RT").split(/\s+/).filter(Boolean).slice(0, 2).map(part => part[0]).join("").toUpperCase();
}

function openView(view) {
  $$(".rt-nav button").forEach(button => button.classList.toggle("is-active", button.dataset.view === view));
  $$(".rt-view").forEach(panel => panel.classList.toggle("is-active", panel.dataset.panel === view));
  const titles = {
    overview: ["PAINEL TÉCNICO", "Visão geral"], professionals: ["EQUIPE ASSISTENCIAL", "Profissionais"],
    compliance: ["ROTINA TÉCNICA", "Conformidade"], supervisions: ["RASTREABILIDADE", "Supervisões"],
    incidents: ["GESTÃO DE RISCO", "Ocorrências"]
  };
  $("#pageEyebrow").textContent = titles[view][0];
  $("#pageTitle").textContent = titles[view][1];
  $(".rt-sidebar").classList.remove("is-open");
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function renderActor() {
  const actor = state.actor || {};
  $("#rtActorName").textContent = actor.name || "Responsável Técnico";
  $("#rtActorCrp").textContent = actor.crp ? `CRP ${actor.crp}` : "Acesso verificado";
  $("#rtInitials").textContent = initials(actor.name);
}

function renderDashboard() {
  const data = state.dashboard || { metrics: {}, attention: [], recentSupervisions: [] };
  const m = data.metrics || {};
  $("#metricProfessionals").textContent = m.professionals ?? 0;
  $("#metricProfessionalsNote").textContent = `${m.verifiedProfessionals || 0} com cadastro regular`;
  const compliance = m.professionals ? Math.round((m.verifiedProfessionals / m.professionals) * 100) : 100;
  $("#metricCompliance").textContent = `${compliance}%`;
  $("#metricSupervisions").textContent = m.supervisions30d ?? 0;
  $("#metricIncidents").textContent = m.openIncidents ?? 0;
  $("#metricIncidentsNote").textContent = m.criticalIncidents ? `${m.criticalIncidents} crítica(s)` : "sob acompanhamento";
  $("#metricSessions").textContent = m.sessions30d ?? 0;
  $("#metricSessionsCompleted").textContent = `${m.completedSessions30d || 0} concluídos`;
  $("#navProfessionals").textContent = m.professionals ?? 0;
  $("#navIncidents").textContent = m.openIncidents ?? 0;

  const attention = data.attention || [];
  $("#attentionList").innerHTML = attention.length ? attention.map(item => `
    <div class="rt-list-item"><span class="rt-list-mark warning">!</span><p><strong>${escapeHtml(item.name)}</strong><small>${!item.councilNumber ? "Registro profissional não informado" : "Verificação cadastral pendente"}</small></p><em>Pendente</em></div>
  `).join("") : `<div class="rt-list-empty"><span>✓</span><p><strong>Nenhuma pendência profissional</strong><small>Todos os cadastros estão regulares.</small></p></div>`;

  const recent = data.recentSupervisions || [];
  $("#recentSupervisions").innerHTML = recent.length ? recent.slice(0, 4).map(item => `
    <div class="rt-list-item"><span class="rt-list-mark ok">✓</span><p><strong>${escapeHtml(item.title)}</strong><small>${label(typeLabels, item.type)} · ${formatDate(item.supervisedAt || item.createdAt)}</small></p><em>${item.durationMinutes || 0} min</em></div>
  `).join("") : `<div class="rt-list-empty"><span>≋</span><p><strong>Nenhuma supervisão registrada</strong><small>Crie o primeiro registro de acompanhamento.</small></p></div>`;
}

function renderProfessionals() {
  const term = $("#professionalSearch").value.trim().toLowerCase();
  const rows = state.professionals.filter(item => [item.name, item.email, item.councilNumber].join(" ").toLowerCase().includes(term));
  $("#professionalsBody").innerHTML = rows.map(item => `
    <tr><td><div class="rt-person"><span>${escapeHtml(initials(item.name))}</span><p><strong>${escapeHtml(item.name)}</strong><small>${escapeHtml(item.email || "E-mail não informado")}</small></p></div></td>
    <td><strong>${escapeHtml(item.council)} ${escapeHtml(item.councilNumber || "—")}</strong></td>
    <td><span class="rt-status ${item.verified && item.councilNumber ? "compliant" : "pending"}"><i></i>${item.verified && item.councilNumber ? "Regular" : "Revisar"}</span></td>
    <td><strong>${item.sessions30d || 0}</strong><small class="rt-cell-note">${item.completedSessions30d || 0} concluídas</small></td>
    <td>${formatDate(item.lastSessionAt)}</td></tr>
  `).join("");
  $("#professionalsEmpty").hidden = rows.length > 0;
}

function renderChecklist() {
  const groups = state.checklist.reduce((acc, item) => { (acc[item.group] ||= []).push(item); return acc; }, {});
  const compliant = state.checklist.filter(item => item.status === "compliant").length;
  const percent = state.checklist.length ? Math.round(compliant / state.checklist.length * 100) : 0;
  $("#compliancePercent").textContent = `${percent}%`;
  $("#complianceBar").style.width = `${percent}%`;
  $("#navCompliance").textContent = state.checklist.length - compliant;
  $("#complianceGroups").innerHTML = Object.entries(groups).map(([group, items]) => `
    <section class="rt-checklist-card"><header><p>${escapeHtml(group)}</p><span>${items.filter(i => i.status === "compliant").length}/${items.length} concluídos</span></header>
      ${items.map(item => `<button class="rt-check-row" data-check-key="${escapeHtml(item.key)}"><span class="rt-check-box ${escapeHtml(item.status)}">${item.status === "compliant" ? "✓" : item.status === "review" ? "…" : ""}</span><p><strong>${escapeHtml(item.title)}</strong><small>${escapeHtml(item.note || `Revisão ${label(cadenceLabels, item.cadence).toLowerCase()}`)}</small></p><em>${item.lastReviewedAt ? formatDate(item.lastReviewedAt) : "Não revisado"}</em><b>›</b></button>`).join("")}
    </section>`).join("");
}

function renderSupervisions() {
  $("#supervisionTimeline").innerHTML = state.supervisions.length ? state.supervisions.map(item => `
    <article class="rt-timeline-item"><div class="rt-timeline-date"><strong>${new Date(item.supervisedAt || item.createdAt).toLocaleDateString("pt-BR", { day: "2-digit", month: "short" })}</strong><span>${new Date(item.supervisedAt || item.createdAt).getFullYear()}</span></div><i></i><div class="rt-timeline-card"><header><span>${escapeHtml(label(typeLabels, item.type))}</span><small>${item.durationMinutes || 0} min · ${item.participantCount || 0} participante(s)</small></header><h3>${escapeHtml(item.title)}</h3><p>${escapeHtml(item.summary)}</p>${item.actions?.length ? `<div class="rt-actions"><strong>Providências</strong>${item.actions.map(action => `<span>→ ${escapeHtml(action)}</span>`).join("")}</div>` : ""}<footer>Registrado por ${escapeHtml(item.rtName || "Responsável Técnico")}</footer></div></article>
  `).join("") : `<div class="rt-empty-state"><span>≋</span><h3>Comece o histórico de supervisão</h3><p>Documente reuniões, orientações e auditorias realizadas.</p></div>`;
}

function renderIncidents() {
  const items = state.incidents.filter(item => state.incidentFilter === "all" || item.status === state.incidentFilter);
  $("#incidentsList").innerHTML = items.length ? items.map(item => `
    <article class="rt-incident ${escapeHtml(item.severity)}"><header><span class="rt-severity">${escapeHtml(label(severityLabels, item.severity))}</span><span class="rt-status ${escapeHtml(item.status)}"><i></i>${escapeHtml(label(statusLabels, item.status))}</span><time>${formatDate(item.occurredAt || item.createdAt)}</time></header><h3>${escapeHtml(item.title)}</h3><p>${escapeHtml(item.description)}</p>${item.resolution ? `<div class="rt-resolution"><strong>Providência registrada</strong>${escapeHtml(item.resolution)}</div>` : ""}<footer>${item.status !== "resolved" ? `<button data-incident-id="${escapeHtml(item.id)}" data-next-status="monitoring">Acompanhar</button><button data-incident-id="${escapeHtml(item.id)}" data-next-status="resolved">Marcar como resolvida</button>` : `<span>Concluída em ${formatDate(item.resolvedAt)}</span>`}</footer></article>
  `).join("") : `<div class="rt-empty-state"><span>✓</span><h3>Nenhuma ocorrência nesta categoria</h3><p>Os novos registros aparecerão aqui.</p></div>`;
}

function renderAll() {
  renderActor(); renderDashboard(); renderProfessionals(); renderChecklist(); renderSupervisions(); renderIncidents();
  $("#rtSync").innerHTML = `<i></i> Atualizado às ${new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}`;
}

async function loadAll() {
  $("#rtRefresh").classList.add("is-loading");
  const [me, dashboard, professionals, incidents, supervisions, checklist] = await Promise.all([
    api("/rt/me"), api("/rt/dashboard"), api("/rt/profissionais"), api("/rt/incidentes"), api("/rt/supervisoes"), api("/rt/checklist")
  ]);
  Object.assign(state, { actor: me.actor, dashboard, professionals: professionals.professionals || [], incidents: incidents.incidents || [], supervisions: supervisions.supervisions || [], checklist: checklist.items || [] });
  renderAll();
  $("#rtRefresh").classList.remove("is-loading");
}

function setupModal(formSelector, modalSelector, buildPayload, endpoint, successText) {
  const form = $(formSelector), modal = $(modalSelector);
  form.addEventListener("submit", async event => {
    event.preventDefault();
    if (event.submitter?.value === "cancel") { modal.close(); return; }
    const error = form.querySelector("[data-error]");
    const submit = form.querySelector("[data-submit]");
    error.textContent = ""; submit.disabled = true;
    try {
      await api(endpoint, { method: "POST", body: JSON.stringify(buildPayload(new FormData(form))) });
      modal.close(); form.reset(); showToast(successText); await loadAll();
    } catch (err) { error.textContent = "Não foi possível salvar. Verifique os campos e tente novamente."; }
    finally { submit.disabled = false; }
  });
}

setupModal("#supervisionForm", "#supervisionModal", data => ({
  type: data.get("type"), supervisedAt: data.get("supervisedAt"), title: data.get("title"),
  participantCount: Number(data.get("participantCount")), durationMinutes: Number(data.get("durationMinutes")),
  summary: data.get("summary"), actions: String(data.get("actions") || "").split("\n").map(x => x.trim()).filter(Boolean)
}), "/rt/supervisoes", "Supervisão registrada com sucesso.");

setupModal("#incidentForm", "#incidentModal", data => ({
  category: data.get("category"), severity: data.get("severity"), title: data.get("title"), description: data.get("description")
}), "/rt/incidentes", "Ocorrência registrada para acompanhamento.");

$("#checklistForm").addEventListener("submit", async event => {
  event.preventDefault(); const modal = $("#checklistModal");
  if (event.submitter?.value === "cancel") { modal.close(); return; }
  const form = event.currentTarget, data = new FormData(form), submit = form.querySelector("[data-submit]");
  submit.disabled = true;
  try {
    await api(`/rt/checklist/${encodeURIComponent(data.get("key"))}`, { method: "PATCH", body: JSON.stringify({ status: data.get("status"), note: data.get("note") }) });
    modal.close(); showToast("Revisão de conformidade salva."); await loadAll();
  } catch (_) { form.querySelector("[data-error]").textContent = "Não foi possível salvar a revisão."; }
  finally { submit.disabled = false; }
});

document.addEventListener("click", async event => {
  const nav = event.target.closest("[data-view], [data-go]");
  if (nav) openView(nav.dataset.view || nav.dataset.go);
  const check = event.target.closest("[data-check-key]");
  if (check) {
    const item = state.checklist.find(entry => entry.key === check.dataset.checkKey);
    const form = $("#checklistForm");
    form.elements.key.value = item.key; form.elements.status.value = item.status; form.elements.note.value = item.note || "";
    $("#checklistModalTitle").textContent = item.title; $("#checklistModal").showModal();
  }
  const incidentButton = event.target.closest("[data-incident-id]");
  if (incidentButton) {
    const nextStatus = incidentButton.dataset.nextStatus;
    const resolution = nextStatus === "resolved" ? window.prompt("Registre a providência adotada para concluir esta ocorrência:") : "";
    if (nextStatus === "resolved" && !resolution) return;
    incidentButton.disabled = true;
    try { await api(`/rt/incidentes/${encodeURIComponent(incidentButton.dataset.incidentId)}`, { method: "PATCH", body: JSON.stringify({ status: nextStatus, resolution }) }); showToast("Ocorrência atualizada."); await loadAll(); }
    catch (_) { showToast("Não foi possível atualizar a ocorrência.", true); }
  }
});

$$('[data-incident-filter]').forEach(button => button.addEventListener("click", () => {
  state.incidentFilter = button.dataset.incidentFilter;
  $$('[data-incident-filter]').forEach(x => x.classList.toggle("is-active", x === button));
  renderIncidents();
}));

$("#professionalSearch").addEventListener("input", renderProfessionals);
$("#newSupervision").addEventListener("click", () => { $("#supervisionForm").elements.supervisedAt.value = new Date().toISOString().slice(0, 10); $("#supervisionModal").showModal(); });
$("#newIncident").addEventListener("click", () => $("#incidentModal").showModal());
$("#rtRefresh").addEventListener("click", () => loadAll().catch(() => showToast("Falha ao atualizar os dados.", true)));
$("#rtMenuToggle").addEventListener("click", () => $(".rt-sidebar").classList.toggle("is-open"));
$("#rtLogout").addEventListener("click", async () => { await signOut(auth); window.location.replace("./rt-login.html"); });

const now = new Date();
$("#todayCard").innerHTML = `<small>${now.toLocaleDateString("pt-BR", { weekday: "long" })}</small><strong>${now.getDate()}</strong><span>${now.toLocaleDateString("pt-BR", { month: "long", year: "numeric" })}</span>`;

onAuthStateChanged(auth, async user => {
  if (!user) { window.location.replace("./rt-login.html"); return; }
  try {
    await loadAll(); $("#rtLoader").hidden = true; $("#rtApp").hidden = false;
  } catch (error) {
    if (["ACESSO_RT_NAO_LIBERADO", "EMAIL_DO_RT_NAO_VERIFICADO", "TOKEN_INVALIDO"].includes(error.message)) {
      await signOut(auth); window.location.replace("./rt-login.html"); return;
    }
    $("#rtLoader").innerHTML = `<p>Não foi possível carregar o painel.<br><button onclick="location.reload()">Tentar novamente</button></p>`;
  }
});

