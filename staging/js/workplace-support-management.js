import { onAuthStateChanged, signInWithEmailAndPassword, signOut } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";
import { auth, BACKEND_BASE_URL } from "./firebase-config.js?h=69b74fc63a";
import { ensureMfa } from "./mfa-flow.js?h=d60b79b944";

const $ = id => document.getElementById(id);
const admin = document.body.dataset.supportRole === "admin";
const prefix = admin ? "/therapy/admin/apoio" : "/empresa/apoio";
const categories = { overload: "Sobrecarga", leadership: "Conversa com a liderança", personal: "Questões pessoais" };
const statuses = { open: "Recebido", in_progress: "Em andamento", waiting_employee: "Aguardando a pessoa", resolved: "Aguardando avaliação", closed: "Concluído pela pessoa", cancelled: "Cancelado" };
const actionStatuses = { planned: "Planejada", in_progress: "Em andamento", done: "Concluída" };
let requests = [], companies = [], actions = [], selected = null, nextCursor = null, companyCursor = null;
let companyId = "", config = null, loadEpoch = 0, selectionEpoch = 0, booting = false, mutating = false;

function node(tag, text = "", className = "") {
  const item = document.createElement(tag); item.textContent = text; item.className = className; return item;
}
// Names, reports and messages are written by people; never machine-translate them.
function personal(tag, text = "", className = "") { const item = node(tag, text, className); item.dataset.noI18n = ""; return item; }
function say(text = "", error = false) {
  $("message").hidden = !text; $("message").textContent = text;
  $("message").className = `ap-notice${error ? " ap-notice-error" : ""}`;
  $("message").setAttribute("role", error ? "alert" : "status");
}
function empty(title, description) {
  const item = node("div", "", "ap-empty"); item.append(node("strong", title), node("p", description)); return item;
}
function date(value, withTime = true) {
  const d = new Date(value?.seconds ? value.seconds * 1000 : value);
  return Number.isFinite(d.getTime()) ? d.toLocaleString("pt-BR", withTime ? { dateStyle: "short", timeStyle: "short" } : { dateStyle: "short" }) : "A combinar";
}
function localDateTime(value) {
  if (!value) return "";
  const d = new Date(value?.seconds ? value.seconds * 1000 : value);
  if (!Number.isFinite(d.getTime())) return "";
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
}
function query(extra = {}) {
  const values = { ...extra }; if (admin && companyId) values.companyId = companyId;
  const qs = new URLSearchParams(Object.entries(values).filter(([, v]) => v != null && v !== ""));
  return qs.size ? `?${qs}` : "";
}
const errorMessages = {
  PRAZO_INVALIDO: "Escolha um prazo entre agora e os próximos 90 dias.",
  TEXTO_INVALIDO: "Confira os textos: há um campo vazio, curto demais ou acima do limite.",
  ESTADO_INVALIDO: "Esta etapa não pode ser escolhida para o pedido.",
  PROXIMO_PASSO_OBRIGATORIO: "Descreva o próximo passo antes de marcar o pedido como aguardando avaliação.",
  PEDIDO_ENCERRADO: "Este pedido já foi encerrado pela pessoa e não aceita novas atualizações.",
  LIMITE_DO_ACOMPANHAMENTO: "Este acompanhamento atingiu o limite de mensagens. Combine com a pessoa a abertura de um novo pedido.",
  RESPONSAVEL_OBRIGATORIO: "Informe o responsável de cada caminho ativo.",
  CONTATO_OBRIGATORIO: "Informe um contato de apoio antes de disponibilizar a central.",
  CONFIGURACAO_INVALIDA: "Confira os campos da configuração.",
  ACOLHIMENTO_CONFIGURADO_PELA_EQUIPE: "A equipe de cuidado é configurada pela administração do Espaço Prelúdio.",
  ACAO_INVALIDA: "Informe título e responsável da ação.",
  EMPRESA_INATIVA: "Esta empresa não está ativa.",
  PEDIDO_NAO_ENCONTRADO: "Pedido não encontrado para esta equipe.",
  ACAO_NAO_ENCONTRADA: "Ação não encontrada.",
  RELATORIO_REQUER_PROCESSAMENTO: "O volume de pedidos exige processamento dedicado. Fale com o Espaço Prelúdio.",
  MUITAS_SOLICITACOES: "Muitas tentativas em pouco tempo. Aguarde um momento e tente novamente.",
  APOIO_INDISPONIVEL: "A central está indisponível no momento. Tente novamente em instantes.",
  ROTA_NAO_ENCONTRADA: "A Central de apoio ainda não está disponível. Tente novamente mais tarde."
};
function errorText(error) {
  if (errorMessages[error.details?.error]) return errorMessages[error.details.error];
  if (error.status === 409) return "Este registro foi atualizado por outra pessoa. Atualize os dados e revise antes de salvar novamente.";
  if (error.status === 403) return "Esta conta não tem permissão para acessar este atendimento.";
  if (error.status === 429) return "Muitas tentativas em pouco tempo. Aguarde um momento e tente novamente.";
  if (error instanceof TypeError) return "Não foi possível conectar. Confira a conexão e tente novamente.";
  return error.message || "Não foi possível concluir. Tente novamente.";
}
async function api(path, options = {}) {
  const token = admin ? await auth.currentUser?.getIdToken() : sessionStorage.getItem("ep:empresa:token");
  if (!token) { if (!admin) location.replace("./empresa-login.html"); throw new Error("Entre novamente para continuar."); }
  const response = await fetch(`${BACKEND_BASE_URL}${prefix}${path}`, { ...options, cache: "no-store", credentials: "omit", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" } });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(data.message || data.error || `Falha no atendimento (${response.status}).`); error.status = response.status; error.details = data;
    if (response.status === 401 && !admin) { sessionStorage.removeItem("ep:empresa:token"); location.replace("./empresa-login.html"); }
    if (admin && ["NAO_AUTORIZADO", "EMAIL_NAO_VERIFICADO", "ADMIN_NAO_CONFIGURADO", "TOKEN_INVALIDO", "TOKEN_NAO_INFORMADO"].includes(data.error)) showAccess(error);
    throw error;
  }
  return data;
}
function button(text, callback, quiet = true) {
  const item = node("button", text, `ap-btn${quiet ? " ap-btn-quiet" : ""}`); item.type = "button";
  item.addEventListener("click", callback); return item;
}
function field(label, name, value = "", type = "text", required = false, maxLength = 120) {
  const wrapper = node("label", "", "ap-field"), input = node(type === "textarea" ? "textarea" : "input");
  input.name = name; input.value = value; input.required = required; input.maxLength = maxLength;
  if (type !== "textarea") input.type = type;
  wrapper.append(node("span", label), input); return wrapper;
}
function selectField(label, name, values, selectedValue) {
  const wrapper = node("label", "", "ap-field"), select = node("select"); select.name = name;
  Object.entries(values).forEach(([value, text]) => select.add(new Option(text, value)));
  select.value = selectedValue; wrapper.append(node("span", label), select); return wrapper;
}
function badge(status) { const span = node("span", statuses[status] || status, "ap-status"); span.dataset.status = status; return span; }
function requestTitle(item) { return categories[item.category] || "Pedido de apoio"; }
function active(item) { return !["closed", "cancelled"].includes(item.status); }
function isOverdue(item) { return active(item) && !["resolved", "waiting_employee"].includes(item.status) && item.dueAt && new Date(item.dueAt).getTime() < Date.now(); }

function renderList() {
  const status = $("statusFilter").value, category = $("categoryFilter").value;
  const filtered = requests.filter(item => (!status || (status === "active" ? active(item) : item.status === status)) && (!category || item.category === category));
  $("listCount").textContent = requests.length ? `${filtered.length} de ${requests.length} pedidos carregados${nextCursor ? " · há mais pedidos abaixo" : ""}` : "";
  $("requests").replaceChildren();
  if (!filtered.length) $("requests").append(empty(requests.length ? "Nenhum pedido neste filtro." : "Tudo pronto para acolher.", requests.length ? "Escolha outra etapa ou situação, ou carregue mais pedidos." : "Os pedidos aparecerão aqui quando alguém compartilhar uma situação com esta equipe."));
  for (const item of filtered) {
    const row = node("button", "", "ap-request"); row.type = "button"; row.setAttribute("aria-pressed", String(item.id === selected?.id));
    const meta = node("div", "", "ap-request-meta"); meta.append(badge(item.status), node("span", date(item.createdAt, false)));
    row.append(meta, node("strong", requestTitle(item)), personal("p", item.employeeName || "Colaborador", "ap-muted"));
    if (isOverdue(item)) row.append(node("p", `Prazo ultrapassado · ${date(item.dueAt)}`, "ap-overdue"));
    else if (item.ownerName) { const owner = node("p", "Com ", "ap-muted"); owner.append(personal("span", item.ownerName)); row.append(owner); }
    else row.append(node("p", "Aguardando responsável", "ap-muted"));
    row.addEventListener("click", () => { if (!mutating) selectRequest(item.id, true); }); $("requests").append(row);
  }
  $("moreRequests").hidden = !nextCursor;
}
async function loadRequests(more = false) {
  if (admin && !companyId) { requests = []; renderList(); return; }
  const epoch = ++loadEpoch;
  $("refreshRequests").disabled = true; $("moreRequests").disabled = true;
  $("requests").setAttribute("aria-busy", "true");
  if (!more && !requests.length) $("requests").replaceChildren(node("p", "Carregando pedidos…", "ap-muted"));
  try {
    const data = await api(`/requests${query({ cursor: more ? nextCursor : "" })}`);
    if (epoch !== loadEpoch) return;
    const allowed = (data.items || []).filter(item => item.recipient === (admin ? "care" : "company"));
    requests = more ? [...new Map([...requests, ...allowed].map(item => [item.id, item])).values()] : allowed;
    nextCursor = data.nextCursor || null; renderList();
  } catch (error) { if (epoch === loadEpoch) { say(errorText(error), true); if (!requests.length) $("requests").replaceChildren(empty("Não foi possível carregar.", "Use Atualizar para tentar novamente.")); } }
  finally { if (epoch === loadEpoch) { $("refreshRequests").disabled = false; $("moreRequests").disabled = false; $("requests").setAttribute("aria-busy", "false"); } }
}
async function selectRequest(id, focus = false) {
  const epoch = ++selectionEpoch;
  $("detail").setAttribute("aria-busy", "true");
  try {
    const data = await api(`/requests/${encodeURIComponent(id)}`);
    if (epoch !== selectionEpoch) return;
    if (data.item?.recipient !== (admin ? "care" : "company")) throw new Error("Este pedido não pertence a esta equipe.");
    selected = data.item; renderDetail(); renderList();
    if (focus) { const title = $("detailTitle"); title.focus({ preventScroll: true }); if (window.innerWidth < 681) title.scrollIntoView({ behavior: "smooth", block: "start" }); }
  } catch (error) { if (epoch === selectionEpoch) say(errorText(error), true); }
  finally { if (epoch === selectionEpoch) $("detail").setAttribute("aria-busy", "false"); }
}
function renderDetail(draft = "") {
  const item = selected; if (!item) return;
  const container = $("detail"); container.replaceChildren();
  const header = node("div", "", "ap-row"); header.append(badge(item.status), node("span", `Recebido em ${date(item.createdAt)}`, "ap-muted"));
  const title = node("h2", requestTitle(item), "ap-detail-title"); title.id = "detailTitle"; title.tabIndex = -1;
  container.append(header, title, personal("p", [item.employeeName || "Colaborador", item.employeeEmail].filter(Boolean).join(" · "), "ap-detail-person"));
  container.append(personal("p", item.text, "ap-request-text"));
  if (item.need) { const need = node("div", "", "ap-need"); need.append(node("strong", "O que a pessoa precisa"), personal("p", item.need, "ap-request-text")); container.append(need); }
  if (item.feedback) {
    const value = typeof item.feedback === "string" ? item.feedback : item.feedback.value || item.feedback.outcome;
    const label = { helped: "A pessoa informou que o apoio ajudou.", need_support: "A pessoa ainda precisa de apoio.", continues: "A pessoa informou que o problema continua." }[value] || "A pessoa registrou uma avaliação do atendimento.";
    container.append(node("p", label, "ap-feedback"));
    if (item.feedback.text) container.append(personal("p", item.feedback.text, "ap-request-text"));
  }
  const plan = node("section", "", "ap-section"); plan.append(node("h3", "Responsabilidade e próximo passo"));
  if (active(item)) {
    const form = node("form"); form.id = "requestPlanForm";
    const grid = node("div", "", "ap-grid"); grid.append(field("Responsável", "ownerName", item.ownerName || "", "text", true), field("Prazo combinado", "dueAt", localDateTime(item.dueAt), "datetime-local", true));
    // "Recebido" is only the starting point; the team cannot move a request back to it.
    const stages = Object.fromEntries(Object.entries(statuses).filter(([key]) => !["closed", "cancelled"].includes(key) && (key !== "open" || item.status === "open")));
    form.append(grid, field("Próximo passo visível para a pessoa", "nextStep", item.nextStep || "", "textarea", true, 1000), selectField("Etapa do atendimento", "status", stages, item.status));
    form.append(node("p", "Ao marcar Aguardando avaliação, a pessoa poderá dizer se ajudou ou se ainda precisa de apoio.", "ap-muted"));
    const save = node("button", "Salvar acompanhamento", "ap-btn"); save.type = "submit"; form.append(save);
    form.addEventListener("submit", event => {
      event.preventDefault(); if (!form.reportValidity()) return;
      const values = Object.fromEntries(new FormData(form));
      // Send the deadline and stage only when changed: an overdue deadline must not block other edits.
      if (values.dueAt === localDateTime(item.dueAt)) delete values.dueAt;
      else values.dueAt = new Date(values.dueAt).toISOString();
      if (values.status === item.status) delete values.status;
      mutateRequest(form, "", "PATCH", values, "Próximo passo atualizado. A pessoa pode acompanhar pelo portal.");
    }); plan.append(form);
  } else plan.append(personal("p", `${item.ownerName || "Equipe"} · ${item.nextStep || "Acompanhamento encerrado."}`, "ap-muted"));
  container.append(plan);
  const conversation = node("section", "", "ap-section"); conversation.append(node("h3", "Conversa de acompanhamento"));
  const messages = node("div", "", "ap-conversation"); messages.setAttribute("aria-label", "Mensagens do atendimento");
  for (const entry of item.messages || []) {
    const message = node("article", "", `ap-message${entry.actor === "employee" ? "" : " ap-from-team"}`);
    message.append(node("small", `${entry.actor === "employee" ? item.employeeName || "Colaborador" : entry.actor === "care" ? "Equipe de cuidado" : "Equipe da empresa"} · ${date(entry.at || entry.createdAt)}`), personal("p", entry.text)); messages.append(message);
  }
  if (!messages.childNodes.length) messages.append(node("p", "Ainda não há mensagens. A primeira resposta pode começar acolhendo o que foi compartilhado.", "ap-muted"));
  conversation.append(messages);
  if (active(item)) {
    const reply = node("form"); reply.id = "replyForm";
    reply.append(field("Mensagem para a pessoa", "text", draft, "textarea", true, 3000));
    const send = node("button", "Enviar resposta", "ap-btn"); send.type = "submit"; reply.append(send);
    reply.addEventListener("submit", event => { event.preventDefault(); if (!reply.reportValidity()) return; mutateRequest(reply, "/messages", "POST", { text: reply.elements.text.value.trim() }, "Resposta enviada."); });
    conversation.append(reply);
  }
  container.append(conversation);
  if (item.events?.length) {
    const history = node("details", "", "ap-section"); history.append(node("summary", "Histórico do acompanhamento")); const list = node("ol", "", "ap-timeline");
    for (const event of item.events) list.append(node("li", `${date(event.at || event.createdAt)} · ${event.status ? statuses[event.status] || "Atualização registrada" : { created: "Pedido recebido", message: "Mensagem registrada", updated: "Acompanhamento atualizado", feedback: "Avaliação da pessoa", cancelled: "Pedido cancelado", closed: "Conclusão confirmada" }[event.type] || "Atualização registrada"}`));
    history.append(list); container.append(history);
  }
  if (mutating) container.querySelectorAll("button").forEach(b => b.disabled = true);
}
async function mutateRequest(form, suffix, method, payload, success) {
  if (mutating || !selected) return;
  const id = selected.id, version = selected.version, draft = $("replyForm")?.elements.text.value || "";
  mutating = true; $("detail").querySelectorAll("button").forEach(b => b.disabled = true); $("companySelect").disabled = true;
  try {
    const data = await api(`/requests/${encodeURIComponent(id)}${suffix}`, { method, body: JSON.stringify({ ...payload, version }) });
    if (selected?.id === id) { if (data.item) selected = data.item; else selected = (await api(`/requests/${encodeURIComponent(id)}`)).item; renderDetail(suffix ? "" : draft); }
    await loadRequests(); say(success);
  } catch (error) {
    if (error.status === 409 && selected?.id === id) { await selectRequest(id); renderDetail(draft); }
    say(error.status === 409 ? "Este pedido recebeu uma atualização. Os dados atuais foram carregados; revise antes de salvar novamente. Sua mensagem foi preservada." : errorText(error), true);
  } finally { mutating = false; $("detail").querySelectorAll("button").forEach(b => b.disabled = false); $("companySelect").disabled = false; }
}

function renderConfig(value) {
  config = value || {}; const form = $("configForm");
  for (const name of ["enabled", "careEnabled", "companyEnabled"]) form.elements[name].checked = config[name] === true;
  for (const name of ["careOwnerName", "companyOwnerName", "contact"]) form.elements[name].value = config[name] || "";
  form.elements.responseHours.value = config.responseHours || 48;
  $("configFields").disabled = false;
}
async function loadConfig() {
  $("configFields").disabled = true;
  if (admin) { const selectedCompany = companies.find(c => c.id === companyId); if (selectedCompany) renderConfig(selectedCompany.config); }
  else { const data = await api("/config"); renderConfig(data.config); }
}
async function loadSummary() {
  if (admin) return;
  $("summary").replaceChildren(node("p", "Preparando a visão coletiva…", "ap-muted"));
  try {
    const data = await api("/summary"), summary = data.summary || data;
    const area = $("summary"); area.replaceChildren();
    area.append(node("p", `Período: ${summary.period || "mês anterior"} · retrato mensal protegido`, "ap-muted"), node("p", summary.note || "Somente pedidos com autorização para uso coletivo participam desta visão. Grupos pequenos são protegidos.", "ap-notice"));
    if (summary.suppressed) { area.append(empty("Ainda não há um grupo suficiente para esta visão.", `Os indicadores são liberados a partir de ${summary.threshold || 10} participantes distintos no período. A ausência de indicadores não significa ausência de dificuldades.`)); return; }
    const metrics = node("div", "", "ap-metrics");
    for (const [label, value, helper] of [["Pedidos no período", summary.total, "Com autorização para análise coletiva"], ["Tempo médio de resposta", summary.averageResponseHours == null ? null : `${summary.averageResponseHours}h`, "Da abertura à primeira resposta"], ["O apoio ajudou", summary.helped, "Avaliações positivas recebidas"]]) {
      const metric = node("div", "", "ap-metric"); metric.append(node("p", label), node("strong", value == null ? "—" : String(value)), node("span", value == null ? "Dado protegido ou ainda indisponível" : helper)); metrics.append(metric);
    } area.append(metrics, node("h3", "Situações compartilhadas"));
    if (summary.categoriesSuppressed) area.append(node("p", "A distribuição por situação foi protegida para evitar a identificação de grupos pequenos.", "ap-notice"));
    else for (const category of summary.categories || []) { const row = node("div", "", "ap-topic"); row.append(node("span", category.label || categories[category.id] || "Situação"), node("strong", `${category.count} pedidos`)); area.append(row); }
    area.append(node("p", "Use esta leitura para orientar mudanças nas condições de trabalho. Os números representam pedidos voluntários, sem medir a saúde de toda a equipe.", "ap-muted"));
  } catch (error) { $("summary").replaceChildren(empty("Não foi possível carregar os indicadores.", errorText(error)), button("Tentar novamente", loadSummary)); }
}
async function loadActions() {
  if (admin) return;
  const data = await api("/actions"); actions = data.items || [];
  $("actions").replaceChildren();
  if (!actions.length) $("actions").append(empty("O primeiro compromisso começa aqui.", "Registre uma mudança com responsável e data para avaliar o andamento."));
  for (const item of actions) {
    const card = node("article", "", "ap-action"); card.append(node("span", actionStatuses[item.status] || item.status, "ap-status"), personal("h3", item.title), personal("p", item.description));
    const row = node("div", "", "ap-row"); const meta = node("span", "", "ap-muted"); meta.append(personal("span", item.ownerName), document.createTextNode(` · revisão ${date(`${item.dueDate}T12:00:00`, false)}`));
    row.append(meta, button("Editar ação", () => editAction(item))); card.append(row); $("actions").append(card);
  }
}
function editAction(item) {
  const form = $("actionForm"); for (const key of ["id", "title", "description", "ownerName", "dueDate", "status"]) form.elements[key].value = item[key] || "";
  form.dataset.version = String(item.version);
  $("actionFormTitle").textContent = "Atualizar ação coletiva"; $("cancelActionEdit").hidden = false; form.elements.title.focus();
}
function resetAction() { $("actionForm").reset(); $("actionForm").elements.id.value = ""; $("actionFormTitle").textContent = "Nova ação coletiva"; $("cancelActionEdit").hidden = true; }
function activateTab(id) {
  for (const tab of document.querySelectorAll("[data-panel]")) { const selectedTab = tab.dataset.panel === id; tab.setAttribute("aria-selected", String(selectedTab)); tab.tabIndex = selectedTab ? 0 : -1; $("panel-" + tab.dataset.panel).hidden = !selectedTab; }
  if (id === "impact") loadSummary();
  if (id === "actions") loadActions().catch(error => say(errorText(error), true));
}
for (const tab of document.querySelectorAll("[data-panel]")) {
  tab.tabIndex = tab.getAttribute("aria-selected") === "true" ? 0 : -1;
  tab.addEventListener("click", () => activateTab(tab.dataset.panel));
  tab.addEventListener("keydown", event => {
    if (!["ArrowRight", "ArrowLeft", "Home", "End"].includes(event.key)) return;
    event.preventDefault(); const tabs = [...document.querySelectorAll("[data-panel]")].filter(t => !t.hidden); let index = tabs.indexOf(tab);
    index = event.key === "Home" ? 0 : event.key === "End" ? tabs.length - 1 : (index + (event.key === "ArrowRight" ? 1 : -1) + tabs.length) % tabs.length;
    tabs[index].focus(); activateTab(tabs[index].dataset.panel);
  });
}
$("statusFilter").addEventListener("change", renderList); $("categoryFilter").addEventListener("change", renderList);
$("refreshRequests").addEventListener("click", async () => { if (mutating) return; await loadRequests(); if (selected) await selectRequest(selected.id); });
$("moreRequests").addEventListener("click", () => loadRequests(true));
$("cancelActionEdit").addEventListener("click", resetAction);
$("actionForm").addEventListener("submit", async event => {
  event.preventDefault(); const form = event.currentTarget; if (!form.reportValidity()) return;
  const payload = Object.fromEntries(new FormData(form)), id = payload.id; delete payload.id;
  if (id) payload.version = Number(form.dataset.version);
  const save = form.querySelector("button[type=submit]"); save.disabled = true;
  try { await api(id ? `/actions/${encodeURIComponent(id)}` : "/actions", { method: id ? "PATCH" : "POST", body: JSON.stringify(payload) }); resetAction(); await loadActions(); say("Compromisso salvo e disponível para os colaboradores."); }
  catch (error) { if (error.status === 409) await loadActions().catch(() => {}); say(errorText(error), true); } finally { save.disabled = false; }
});
$("configForm").addEventListener("submit", async event => {
  event.preventDefault(); const form = event.currentTarget; if (!form.reportValidity()) return;
  const payload = { enabled: form.elements.enabled.checked, companyEnabled: form.elements.companyEnabled.checked, companyOwnerName: form.elements.companyOwnerName.value.trim(), responseHours: Number(form.elements.responseHours.value), contact: form.elements.contact.value.trim() };
  if (admin) Object.assign(payload, { careEnabled: form.elements.careEnabled.checked, careOwnerName: form.elements.careOwnerName.value.trim() });
  if (payload.enabled && !payload.companyEnabled && !(admin ? payload.careEnabled : config?.careEnabled)) { say("Escolha pelo menos uma equipe disponível antes de ativar a central.", true); return; }
  if ((payload.companyEnabled && !payload.companyOwnerName) || (payload.careEnabled && !payload.careOwnerName) || (payload.enabled && !payload.contact)) { say("Informe os responsáveis pelos serviços ativos e um contato de apoio.", true); return; }
  const save = form.querySelector("button[type=submit]"); save.disabled = true; $("companySelect").disabled = true;
  try {
    const data = await api(admin ? `/companies/${encodeURIComponent(companyId)}/config` : "/config", { method: "PUT", body: JSON.stringify(payload) });
    renderConfig(data.config || { ...config, ...payload }); const company = companies.find(c => c.id === companyId); if (company) company.config = config;
    say(payload.enabled ? "Disponibilidade e prazo de resposta atualizados." : "Novos pedidos pausados. O acompanhamento dos pedidos existentes continua disponível.");
  } catch (error) { say(errorText(error), true); } finally { save.disabled = false; $("companySelect").disabled = false; }
});

function showAccess(error) {
  $("accessPanel").hidden = false; $("workspace").hidden = true;
  selected = null; requests = []; loadEpoch++; selectionEpoch++;
  $("requests").replaceChildren(); $("detail").replaceChildren();
  $("accessMessage").textContent = error ? error.status === 403 ? "Esta conta não tem acesso à equipe de cuidado. Entre com a conta autorizada." : errorText(error) : "Entre com sua conta administradora para acessar os pedidos destinados ao cuidado.";
  $("retryAccess").hidden = !auth.currentUser; $("signOutAdmin").hidden = !auth.currentUser;
}
async function loadCompanies(more = false) {
  $("moreCompanies").disabled = true;
  try {
    const data = await api(`/companies${more && companyCursor ? `?cursor=${encodeURIComponent(companyCursor)}` : ""}`);
    const incoming = data.companies || data.items || [];
    companies = more ? [...new Map([...companies, ...incoming].map(c => [c.id, c])).values()] : incoming;
    companyCursor = data.nextCursor || null;
    $("companySelect").replaceChildren(new Option("Selecione uma empresa", ""));
    for (const company of companies) $("companySelect").add(new Option(company.name || company.id, company.id));
    $("companySelect").value = companyId; $("moreCompanies").hidden = !companyCursor;
  } finally { $("moreCompanies").disabled = false; }
}
async function changeCompany() {
  companyId = $("companySelect").value; selected = null; requests = []; nextCursor = null; loadEpoch++; selectionEpoch++;
  $("detail").replaceChildren(empty("Selecione um pedido.", "A conversa e os próximos passos aparecerão aqui."));
  $("configFields").disabled = true; say(); renderList();
  if (companyId) { await loadConfig(); await loadRequests(); }
}
$("companySelect").addEventListener("change", () => changeCompany().catch(error => say(errorText(error), true)));
$("moreCompanies").addEventListener("click", () => loadCompanies(true).catch(error => say(errorText(error), true)));
async function bootAdmin() {
  if (booting) return; if (!auth.currentUser) { showAccess(); return; } booting = true;
  try {
    await ensureMfa(auth.currentUser); await loadCompanies();
    $("accessPanel").hidden = true; $("workspace").hidden = false;
    const target = new URLSearchParams(location.search).get("empresa");
    if (target && companies.some(c => c.id === target)) { $("companySelect").value = target; await changeCompany(); }
    else { renderList(); say("Selecione uma empresa para acolher os pedidos e configurar os serviços."); }
  } catch (error) { showAccess(error); } finally { booting = false; }
}
$("adminLoginForm").addEventListener("submit", async event => {
  event.preventDefault(); const form = event.currentTarget; if (!admin || !form.reportValidity()) return;
  const submit = form.querySelector("button[type=submit]"); submit.disabled = true;
  try { await signInWithEmailAndPassword(auth, form.elements.email.value.trim(), form.elements.password.value); form.elements.password.value = ""; await bootAdmin(); }
  catch { $("accessMessage").textContent = "Não foi possível entrar. Confira o e-mail e a senha da conta administradora."; }
  finally { submit.disabled = false; }
});
$("retryAccess").addEventListener("click", bootAdmin);
$("signOutAdmin").addEventListener("click", () => signOut(auth).catch(error => { $("accessMessage").textContent = errorText(error); }));
if (admin) onAuthStateChanged(auth, user => user ? bootAdmin() : showAccess());
else if (!sessionStorage.getItem("ep:empresa:token")) location.replace("./empresa-login.html");
else { $("workspace").hidden = false; loadConfig().catch(error => say(errorText(error), true)); loadRequests(); }
