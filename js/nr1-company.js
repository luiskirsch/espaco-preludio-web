import { BACKEND_BASE_URL } from "./firebase-config.js";

const token = sessionStorage.getItem("ep:empresa:token");
if (!token) location.replace("./empresa-login.html");
const $ = id => document.getElementById(id);
let campaigns = [];
let report = null;

function node(tag, text = "", cls = "") {
  const element = document.createElement(tag);
  element.textContent = text;
  if (cls) element.className = cls;
  return element;
}
function say(message, error = false) {
  $("message").textContent = message;
  $("message").style.color = error ? "#9b462d" : "#2d6a3e";
}
async function api(path, options = {}) {
  const response = await fetch(`${BACKEND_BASE_URL}${path}`, {
    ...options,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...(options.headers || {}) }
  });
  if (response.status === 401) {
    sessionStorage.removeItem("ep:empresa:token");
    location.replace("./empresa-login.html");
    throw new Error("Sessão expirada");
  }
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || `Erro HTTP ${response.status}`);
  return data;
}
function formData(form) { return Object.fromEntries(new FormData(form).entries()); }
function fillSelect(select, options, placeholder) {
  select.replaceChildren(new Option(placeholder, ""));
  options.forEach(item => select.add(new Option(item.name, item.id)));
}
function box(title, body) {
  const div = node("div", "", "nr-item");
  div.append(node("strong", title), node("p", body, "nr-small"));
  return div;
}
function showSurvey(survey, campaign) {
  $("surveyState").textContent = campaign.status === "closed" ? "Coleta encerrada" : campaign.status === "open" ? "Coleta aberta" : "Preparação";
  const results = $("surveyResults");
  const units = $("unitResults");
  results.replaceChildren(); units.replaceChildren();
  if (!survey) {
    $("surveyIntro").textContent = "O RH não acompanha as respostas durante a coleta. O resultado será liberado apenas após o encerramento.";
    return;
  }
  if (!survey.overall.available) {
    $("surveyIntro").textContent = "Ainda não há pelo menos cinco respostas válidas. Nenhum percentual será exibido.";
    return;
  }
  $("surveyIntro").textContent = `${survey.overall.responseCount} respostas válidas. Os percentuais indicam percepção desfavorável sobre condições de trabalho, não diagnóstico nem classificação automática de risco.`;
  for (const item of Object.values(survey.overall.domains)) {
    const card = node("div", "", "nr-item");
    const label = node("div", `${item.label} · ${item.unfavorablePercent}%`, "nr-row-between");
    const meter = node("div", "", "nr-meter");
    const fill = node("span"); fill.style.width = `${item.unfavorablePercent}%`;
    meter.append(fill); card.append(label, meter); results.append(card);
  }
  if (survey.unitBreakdownSuppressed) {
    units.append(box("Unidades protegidas", "A distribuição por unidade foi ocultada para impedir identificação indireta de grupos pequenos."));
  } else {
    for (const unit of survey.units) {
      const text = Object.values(unit.domains).map(d => `${d.label}: ${d.unfavorablePercent}%`).join(" · ");
      units.append(box(`${unit.unitName} · ${unit.responseCount} respostas`, text));
    }
  }
}
function render(reportData) {
  report = reportData;
  $("content").hidden = false;
  const campaign = reportData.campaign;
  $("campaignState").textContent = `Status: ${campaign.status === "closed" ? "encerrada" : campaign.status === "open" ? "aberta" : "rascunho"}. Metodologia: ${campaign.methodology || "aguardando revisão técnica"}`;
  document.querySelectorAll(".unit-select").forEach(select => fillSelect(select, campaign.units, "Selecione a unidade"));
  showSurvey(reportData.survey, campaign);
  $("observations").replaceChildren(...reportData.observations.map(item => box(
    `${campaign.units.find(u => u.id === item.unitId)?.name || "Unidade"} · ${item.activity}`,
    `${item.conditions} · Participação: ${item.workerParticipation}`
  )));
  $("risks").replaceChildren(...reportData.risks.map(item => box(
    `${item.description} · ${item.priority} (${item.score}/25)`,
    `${item.workActivity} · ${item.exposure} · Revisão técnica: ${item.technicalReview === "reviewed" ? "concluída" : "pendente"}`
  )));
  fillSelect($("riskSelect"), reportData.risks.map(item => ({ id: item.id, name: item.description })), "Selecione o risco");
  const actions = reportData.actions.map(item => {
    const risk = reportData.risks.find(r => r.id === item.riskId);
    const wrapper = box(`${item.description} · ${item.status}`, `${risk?.description || "Risco"} · ${item.owner} · até ${item.dueDate} · Verificação: ${item.verification}${item.evidence ? ` · Evidência: ${item.evidence}` : ""}${item.verifiedBy ? ` · Verificado por: ${item.verifiedBy}` : ""}`);
    const form = node("form", "", "nr-row nr-no-print");
    const select = node("select");
    const stages = [["planned", "Planejada"], ["in_progress", "Em andamento"], ["completed", "Concluída"], ["verified", "Verificada"]];
    const stageIndex = stages.findIndex(([value]) => value === item.status);
    stages.slice(stageIndex, stageIndex + 2).forEach(([value, label]) => select.add(new Option(label, value)));
    select.value = item.status;
    const evidence = node("input"); evidence.placeholder = "Evidência / resultado"; evidence.maxLength = 1500; evidence.value = item.evidence || "";
    const verifiedBy = node("input"); verifiedBy.placeholder = "Nome de quem verificou"; verifiedBy.maxLength = 120; verifiedBy.value = item.verifiedBy || "";
    const button = node("button", "Salvar andamento", "nr-btn nr-btn-quiet"); button.type = "submit";
    form.append(select, evidence, verifiedBy, button);
    if (item.status === "verified") form.hidden = true;
    form.addEventListener("submit", async event => {
      event.preventDefault(); button.disabled = true;
      try {
        await api(`/empresa/nr1/campaigns/${campaign.id}/actions/${item.id}`, { method: "PATCH", body: JSON.stringify({ status: select.value, evidence: evidence.value, verifiedBy: verifiedBy.value }) });
        await loadReport(); say("Andamento registrado.");
      } catch (error) { say(error.message, true); }
      finally { button.disabled = false; }
    });
    wrapper.append(form);
    return wrapper;
  });
  $("actions").replaceChildren(...actions);
  $("communications").replaceChildren(...(reportData.communications || []).map(item =>
    box(`${item.audience} · ${item.channel}`, item.summary)));
}
async function loadReport() {
  const id = $("campaignSelect").value;
  if (!id) { $("content").hidden = true; return; }
  render(await api(`/empresa/nr1/campaigns/${id}/report`));
}
async function boot() {
  try {
    const data = await api("/empresa/nr1/campaigns");
    campaigns = data.campaigns;
    fillSelect($("campaignSelect"), campaigns, "Selecione um ciclo");
    if (campaigns.length) { $("campaignSelect").value = campaigns[0].id; await loadReport(); }
    else $("campaignState").textContent = "Nenhum ciclo iniciado. Solicite ao Espaço Prelúdio a revisão da metodologia e abertura da campanha.";
  } catch (error) { say(error.message, true); }
}
$("campaignSelect").addEventListener("change", () => loadReport().catch(error => say(error.message, true)));
$("printBtn").addEventListener("click", () => window.print());
$("participantForm").addEventListener("submit", async event => {
  event.preventDefault();
  const form = event.currentTarget;
  const emails = form.elements.emails.value.split(/[\n,;]+/).map(value => value.trim()).filter(Boolean);
  if (!emails.length || emails.length > 400) { say("Informe entre 1 e 400 e-mails por envio.", true); return; }
  const button = form.querySelector("button"); button.disabled = true;
  try {
    const result = await api("/empresa/nr1/participants", { method: "POST", body: JSON.stringify({ emails }) });
    form.reset(); say(`${result.count} participante(s) habilitado(s).`);
  } catch (error) { say(error.message, true); }
  finally { button.disabled = false; }
});
$("revokeParticipants").addEventListener("click", async () => {
  const form = $("participantForm");
  const emails = form.elements.emails.value.split(/[\n,;]+/).map(value => value.trim()).filter(Boolean);
  if (!emails.length || emails.length > 400) { say("Informe entre 1 e 400 e-mails por envio.", true); return; }
  if (!confirm(`Revogar o acesso de ${emails.length} e-mail(s) à pesquisa?`)) return;
  const button = $("revokeParticipants"); button.disabled = true;
  try {
    const result = await api("/empresa/nr1/participants/revoke", { method: "POST", body: JSON.stringify({ emails }) });
    form.reset(); say(`${result.count} acesso(s) revogado(s).`);
  } catch (error) { say(error.message, true); }
  finally { button.disabled = false; }
});
for (const [formId, path] of [["observationForm", "observations"], ["riskForm", "risks"], ["actionForm", "actions"], ["communicationForm", "communications"]]) {
  $(formId).addEventListener("submit", async event => {
    event.preventDefault();
    const form = event.currentTarget;
    if (!form.reportValidity() || !report) return;
    const button = form.querySelector("button[type=submit]"); button.disabled = true;
    try {
      await api(`/empresa/nr1/campaigns/${report.campaign.id}/${path}`, { method: "POST", body: JSON.stringify(formData(form)) });
      form.reset(); await loadReport(); say("Registro salvo com sucesso.");
    } catch (error) { say(error.message, true); }
    finally { button.disabled = false; }
  });
}
boot();
