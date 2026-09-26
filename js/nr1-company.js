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
function timestampText(value) {
  const millis = value?.seconds ? value.seconds * 1000 : Date.parse(value || "");
  return Number.isFinite(millis) ? new Date(millis).toLocaleString("pt-BR") : "não registrado";
}
function showSurvey(survey, campaign) {
  $("surveyState").textContent = ["closed", "finalized"].includes(campaign.status) ? "Coleta encerrada" : campaign.status === "open" ? "Coleta aberta" : "Preparação";
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
  const participation = survey.participationPercent == null ? "" : ` Adesão: ${survey.participationPercent}% de ${survey.eligibleParticipants} participantes habilitados.`;
  const integrityWarning = survey.invalidEncryptedResponses
    ? ` Atenção: ${survey.invalidEncryptedResponses} resposta(s) não puderam ser lidas e exigem suporte antes da conclusão.` : "";
  $("surveyIntro").textContent = `${survey.overall.responseCount} respostas válidas.${participation}${integrityWarning} Os percentuais indicam percepção desfavorável sobre condições de trabalho, não diagnóstico nem classificação automática de risco.`;
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
  const statusLabel = { draft: "rascunho", open: "coleta aberta", closed: "análise e integração", finalized: "finalizado tecnicamente" }[campaign.status] || campaign.status;
  $("campaignState").textContent = `Status: ${statusLabel}. Metodologia: ${campaign.methodology || "aguardando revisão técnica"}`;
  document.querySelectorAll(".unit-select").forEach(select => fillSelect(select, campaign.units, "Selecione a unidade"));
  showSurvey(reportData.survey, campaign);
  $("observations").replaceChildren(...reportData.observations.map(item => box(
    `${campaign.units.find(u => u.id === item.unitId)?.name || "Unidade"} · ${item.activity}`,
    `${item.conditions} · Participação: ${item.workerParticipation}`
  )));
  $("risks").replaceChildren(...reportData.risks.map(item => box(
    `${item.description} · ${item.priority} (${item.score}/25)`,
    `Processo/ambiente: ${item.processEnvironment} · Atividade: ${item.workActivity} · Grupo exposto: ${item.affectedGroup} · Possíveis agravos: ${item.possibleHarm} · Exposição: ${item.exposure} · Revisão técnica: ${item.technicalReview === "reviewed" ? "concluída" : "pendente"}`
  )));
  fillSelect($("riskSelect"), reportData.risks.map(item => ({ id: item.id, name: item.description })), "Selecione o risco");
  const actions = reportData.actions.map(item => {
    const risk = reportData.risks.find(r => r.id === item.riskId);
    const controlLabel = reportData.controlHierarchy?.[item.controlType] || item.controlType || "hierarquia não informada";
    const overdue = item.status !== "verified" && item.dueDate < new Date().toISOString().slice(0, 10);
    const wrapper = box(`${item.description} · ${item.status}${overdue ? " · ATRASADA" : ""}`, `${risk?.description || "Risco"} · ${controlLabel} · ${item.owner} · até ${item.dueDate} · Verificação: ${item.verification}${item.evidence ? ` · Evidência: ${item.evidence}` : ""}${item.verifiedBy ? ` · Verificado por: ${item.verifiedBy}` : ""}`);
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
  const criteria = campaign.riskCriteria;
  $("criteriaIntro").textContent = `${criteria?.method || "Critérios não registrados"}. ${criteria?.warning || ""}`;
  const criteriaCards = [
    box("Severidade · escala 1–5", Object.entries(criteria?.severity || {}).map(([score, text]) => `${score}: ${text}`).join(" · ") || "Não registrada"),
    box("Probabilidade · escala 1–5", Object.entries(criteria?.likelihood || {}).map(([score, text]) => `${score}: ${text}`).join(" · ") || "Não registrada"),
    ...(criteria?.levels || []).map(item => box(`${item.level} · ${item.min} a ${item.max}`, item.decision))
  ];
  $("criteria").replaceChildren(...criteriaCards);
  const governance = campaign.governance;
  const conclusion = campaign.technicalConclusion;
  $("governanceRecord").replaceChildren(
    box("Organização e ciclo", `${reportData.company?.name || "Organização"} · ${campaign.name} · relatório gerado em ${new Date().toLocaleString("pt-BR")}`),
    box("Escopo", governance?.scope || "Aguardando definição antes da abertura"),
    box("Participação dos trabalhadores", governance?.workerParticipationPlan || "Aguardando definição"),
    box("Privacidade e retenção", governance ? `${governance.privacyContact} · retenção declarada de ${governance.retentionMonths} meses · aviso ${governance.privacyNoticeVersion}` : "Aguardando definição"),
    box("Cronologia", `Abertura: ${timestampText(campaign.openedAt)} · encerramento: ${timestampText(campaign.closedAt)} · finalização: ${timestampText(campaign.finalizedAt)}`),
    box("Revisão e conclusão técnica", conclusion ? `${conclusion.reviewerName} · ${conclusion.reviewerCredential} · ${conclusion.text}` : `Abertura revista por ${campaign.reviewer?.name || "não registrado"} · conclusão pendente`)
  );
  const integration = campaign.integration;
  $("integrationRecord").replaceChildren(integration ? box(
    `${integration.responsibleName} · ${integration.responsibleRole}`,
    `AEP: ${integration.aepReference} · PGR: ${integration.pgrStatus === "integrated" ? integration.pgrReference : `dispensado — ${integration.exemptionRationale}`} · Reavaliar até ${integration.reviewDueDate} · ${integration.integrationNotes}`
  ) : box("Integração pendente", "Disponível após encerrar a coleta e concluir a análise."));
  $("integrationForm").hidden = campaign.status !== "closed" || Boolean(integration);
  for (const id of ["observationForm", "riskForm", "actionForm"]) {
    $(id).hidden = campaign.status === "finalized";
  }
  const reviewed = reportData.risks.every(item => item.technicalReview === "reviewed");
  const actionable = reportData.risks.filter(item => item.priority !== "baixa")
    .every(risk => reportData.actions.some(action => action.riskId === risk.id));
  const unitsObserved = campaign.units.every(unit =>
    reportData.observations.some(item => item.unitId === unit.id));
  const checks = [
    [Boolean(campaign.governance), "Governança e privacidade"],
    [["closed", "finalized"].includes(campaign.status), "Coleta encerrada"],
    [unitsObserved, "Condições observadas em todas as unidades"],
    [reviewed, "Riscos com revisão técnica"],
    [actionable, "Riscos relevantes com medida definida"],
    [reportData.communications.length > 0, "Devolutiva aos trabalhadores"],
    [Boolean(integration), "Integração registrada na AEP/PGR"],
    [campaign.status === "finalized", "Conclusão técnica final"]
  ];
  $("readiness").replaceChildren(...checks.map(([done, label]) =>
    box(done ? `✓ ${label}` : `○ ${label}`, done ? "Concluído" : "Pendente")));
  $("readinessState").textContent = `${checks.filter(([done]) => done).length}/${checks.length} etapas`;
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
    const result = await api("/empresa/nr1/participants", { method: "POST", body: JSON.stringify({ emails, sendInvites: true }) });
    form.reset(); say(`${result.count} participante(s) habilitado(s). Convites enviados: ${result.delivery?.sent || 0}; não enviados: ${(result.delivery?.skipped || 0) + (result.delivery?.failed || 0)}.`);
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
$("integrationForm").addEventListener("submit", async event => {
  event.preventDefault();
  const form = event.currentTarget;
  if (!form.reportValidity() || !report) return;
  const values = formData(form);
  values.criteriaAccepted = form.elements.criteriaAccepted.checked;
  values.confirmResponsibility = form.elements.confirmResponsibility.checked;
  const button = form.querySelector("button[type=submit]"); button.disabled = true;
  try {
    await api(`/empresa/nr1/campaigns/${report.campaign.id}/integration`, {
      method: "POST", body: JSON.stringify(values)
    });
    await loadReport(); say("Integração à AEP/PGR registrada.");
  } catch (error) { say(error.message, true); }
  finally { button.disabled = false; }
});
boot();
