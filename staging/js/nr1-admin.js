import { onAuthStateChanged, signInWithEmailAndPassword, signOut } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";
import { auth, BACKEND_BASE_URL } from "./firebase-config.js";

const $ = id => document.getElementById(id);
let campaigns = [];
let selected = null;
function say(message, error = false) { $("message").textContent = message; $("message").style.color = error ? "#9b462d" : "#2d6a3e"; }
function showAccess(error = null) {
  const user = auth.currentUser;
  const code = error?.details?.error || error?.message;
  const account = user?.email ? `A conta ${user.email} ` : "Esta conta ";
  const message = !user
    ? "Entre com sua conta administradora para acessar os ciclos de avaliação."
    : code === "NAO_AUTORIZADO"
      ? `${account}não tem permissão de administração. Entre com a conta autorizada.`
      : code === "EMAIL_NAO_VERIFICADO"
        ? "Confirme o e-mail da conta administradora antes de continuar."
        : code === "ADMIN_NAO_CONFIGURADO"
          ? "O acesso administrativo não está configurado no servidor. Contate a administração da plataforma."
          : code === "TOKEN_INVALIDO" || code === "TOKEN_NAO_INFORMADO"
            ? "A sessão expirou. Entre novamente com a conta administradora."
            : "Não foi possível verificar o acesso. Tente novamente.";
  $("accessMessage").textContent = message;
  $("accessPanel").hidden = false;
  $("adminWorkspace").hidden = true;
  $("retryAccess").hidden = !user;
  $("signOutAdmin").hidden = !user;
  $("company").replaceChildren(new Option("Acesso não verificado", ""));
}
async function api(path, options = {}) {
  const user = auth.currentUser;
  if (!user) throw new Error("Faça login no painel administrativo.");
  const token = await user.getIdToken();
  const response = await fetch(`${BACKEND_BASE_URL}${path}`, {
    ...options, headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(data.error || `Erro HTTP ${response.status}`);
    error.details = data;
    error.status = response.status;
    if (["NAO_AUTORIZADO", "EMAIL_NAO_VERIFICADO", "ADMIN_NAO_CONFIGURADO", "TOKEN_INVALIDO", "TOKEN_NAO_INFORMADO"].includes(data.error)) showAccess(error);
    throw error;
  }
  return data;
}
function element(tag, text = "", cls = "") {
  const node = document.createElement(tag); node.textContent = text; node.className = cls; return node;
}
async function loadCompanies() {
  const data = await api("/therapy/admin/empresas?status=ativa");
  $("accessPanel").hidden = true;
  $("adminWorkspace").hidden = false;
  $("company").replaceChildren(new Option("Selecione", ""));
  (data.items || []).forEach(item => $("company").add(new Option(item.nome || item.name || item.id, item.id)));
  if (new URLSearchParams(location.search).get("empresa")) {
    $("company").value = new URLSearchParams(location.search).get("empresa");
    await loadCampaigns();
  }
  say("Selecione uma empresa para começar.");
}
async function refreshAccess() {
  if (!auth.currentUser) { showAccess(); return; }
  try {
    await auth.currentUser.getIdToken(true);
    await loadCompanies();
  } catch (error) {
    showAccess(error);
  }
}
async function loadCampaigns() {
  const companyId = $("company").value;
  selected = null; $("details").hidden = true; $("surveyPanel").hidden = true;
  if (!companyId) { $("campaigns").replaceChildren(); return; }
  const data = await api(`/therapy/admin/nr1/campaigns?companyId=${encodeURIComponent(companyId)}`);
  campaigns = data.campaigns;
  $("campaigns").replaceChildren();
  if (!campaigns.length) $("campaigns").append(element("p", "Nenhum ciclo criado.", "nr-small"));
  for (const campaign of campaigns) {
    const button = element("button", `${campaign.name} · ${campaign.status}`, "nr-btn nr-btn-quiet");
    button.type = "button"; button.addEventListener("click", () => selectCampaign(campaign.id));
    $("campaigns").append(button);
  }
}
async function selectCampaign(id) {
  const data = await api(`/therapy/admin/nr1/campaigns/${id}/report`);
  selected = data.campaign;
  $("details").hidden = false;
  $("campaignTitle").textContent = selected.name;
  $("campaignStatus").textContent = `Status: ${selected.status} · ${selected.units.map(u => u.name).join(" / ")}`;
  $("openForm").hidden = selected.status !== "draft";
  $("closeBtn").hidden = selected.status !== "open";
  $("finalizeForm").hidden = selected.status !== "closed";
  const missingUnits = selected.units.filter(unit =>
    !data.observations.some(item => item.unitId === unit.id)).map(unit => unit.name);
  const pendingReviews = data.risks.filter(item => item.technicalReview !== "reviewed");
  const withoutAction = data.risks.filter(risk => risk.priority !== "baixa"
    && !data.actions.some(action => action.riskId === risk.id));
  const pending = [];
  if (selected.status === "open") pending.push("encerrar a coleta");
  if (missingUnits.length) pending.push(`observar as unidades: ${missingUnits.join(", ")}`);
  if (pendingReviews.length) pending.push(`revisar ${pendingReviews.length} risco(s)`);
  if (withoutAction.length) pending.push(`definir ações para ${withoutAction.length} risco(s) relevante(s)`);
  if (!data.communications.length) pending.push("registrar devolutiva aos trabalhadores");
  if (!selected.integration) pending.push("registrar integração à AEP/PGR pela empresa");
  if (data.survey?.invalidEncryptedResponses) pending.push(`${data.survey.invalidEncryptedResponses} resposta(s) cifrada(s) inválida(s)`);
  $("readiness").textContent = selected.status === "finalized"
    ? "Ciclo finalizado tecnicamente e preservado como evidência."
    : `${data.responseCount} resposta(s) recebida(s). ${pending.length ? `Pendências: ${pending.join("; ")}.` : "Pronto para conclusão técnica."}`;
  $("surveyPanel").hidden = !data.survey;
  $("surveySummary").replaceChildren();
  if (data.survey) {
    if (!data.survey.overall.available) {
      $("surveySummary").append(element("p", `Há ${data.survey.totalResponses} resposta(s), abaixo do mínimo de cinco. Nenhum percentual foi revelado.`, "nr-small"));
    } else {
      $("surveySummary").append(element("p", `${data.survey.overall.responseCount} respostas válidas. Resultado exploratório; não converta percentuais automaticamente em grau de risco.`, "nr-small"));
      for (const domain of Object.values(data.survey.overall.domains)) {
        $("surveySummary").append(element("div", `${domain.label}: ${domain.unfavorablePercent}% de percepção desfavorável`, "nr-item"));
      }
      if (data.survey.unitBreakdownSuppressed) {
        $("surveySummary").append(element("p", "Recortes por unidade suprimidos para proteger grupos pequenos.", "nr-small"));
      }
    }
  }
  $("risks").replaceChildren();
  $("risks").append(element("h3", "Revisão dos riscos preliminares"));
  if (!data.risks.length) $("risks").append(element("p", "Ainda não há riscos registrados pela empresa.", "nr-small"));
  for (const risk of data.risks) {
    const card = element("div", "", "nr-item");
    card.append(element("strong", `${risk.description} · ${risk.technicalReview === "reviewed" ? "revisto" : "pendente"}`),
      element("p", `${risk.processEnvironment} · ${risk.workActivity} · ${risk.affectedGroup} · ${risk.possibleHarm} · ${risk.exposure} · Severidade ${risk.severity} / Probabilidade ${risk.likelihood}`, "nr-small"),
      element("p", `Evidência: ${risk.evidence} · Justificativa: ${risk.rationale}`, "nr-small"));
    if (risk.technicalReview !== "reviewed") {
      const form = element("form", "", "nr-no-print");
      const name = element("input"); name.placeholder = "Nome do revisor"; name.required = true; name.minLength = 4;
      const credential = element("input"); credential.placeholder = "Registro / qualificação"; credential.required = true; credential.minLength = 4;
      const notes = element("textarea"); notes.placeholder = "Análise técnica, ressalvas e método"; notes.required = true; notes.minLength = 10;
      const button = element("button", "Registrar revisão técnica", "nr-btn nr-btn-secondary"); button.type = "submit";
      form.append(name, credential, notes, button);
      form.addEventListener("submit", async event => {
        event.preventDefault(); if (!form.reportValidity()) return; button.disabled = true;
        try {
          await api(`/therapy/admin/nr1/campaigns/${id}/risks/${risk.id}/review`, { method: "PATCH", body: JSON.stringify({ reviewerName: name.value, credential: credential.value, notes: notes.value }) });
          await selectCampaign(id); say("Revisão registrada.");
        } catch (error) { say(error.message, true); }
        finally { button.disabled = false; }
      });
      card.append(form);
    }
    $("risks").append(card);
  }
}
$("company").addEventListener("change", () => loadCampaigns().catch(error => say(error.message, true)));
$("createForm").addEventListener("submit", async event => {
  event.preventDefault(); const form = event.currentTarget;
  if (!form.reportValidity() || !$("company").value) { say("Selecione uma empresa.", true); return; }
  const units = form.elements.units.value.split("\n").map(s => s.trim()).filter(Boolean);
  const button = form.querySelector("button"); button.disabled = true;
  try {
    await api("/therapy/admin/nr1/campaigns", { method: "POST", body: JSON.stringify({ companyId: $("company").value, name: form.elements.name.value, units }) });
    form.reset(); await loadCampaigns(); say("Ciclo criado como rascunho.");
  } catch (error) { say(error.message, true); }
  finally { button.disabled = false; }
});
$("openForm").addEventListener("submit", async event => {
  event.preventDefault(); const form = event.currentTarget;
  if (!form.reportValidity() || !selected) return;
  const button = form.querySelector("button"); button.disabled = true;
  try {
    await api(`/therapy/admin/nr1/campaigns/${selected.id}`, { method: "PATCH", body: JSON.stringify({
      status: "open", reviewerName: form.elements.reviewerName.value,
      reviewerCredential: form.elements.reviewerCredential.value,
      methodology: form.elements.methodology.value,
      governance: { scope: form.elements.scope.value,
        workerParticipationPlan: form.elements.workerParticipationPlan.value,
        privacyContact: form.elements.privacyContact.value,
        retentionMonths: Number(form.elements.retentionMonths.value),
        plannedCloseDate: form.elements.plannedCloseDate.value,
        remoteHybridCovered: form.elements.remoteHybridCovered.checked },
      reviewedInstrument: form.elements.reviewedInstrument.checked
    }) });
    const id = selected.id; await loadCampaigns(); await selectCampaign(id); say("Coleta aberta.");
  } catch (error) { say(error.message, true); }
  finally { button.disabled = false; }
});
$("closeBtn").addEventListener("click", async () => {
  if (!selected || !confirm("Encerrar a coleta? Novas respostas não serão aceitas e agregados poderão ser exibidos à empresa.")) return;
  const button = $("closeBtn"); button.disabled = true;
  try {
    const id = selected.id;
    await api(`/therapy/admin/nr1/campaigns/${id}`, { method: "PATCH", body: JSON.stringify({ status: "closed" }) });
    await loadCampaigns(); await selectCampaign(id); say("Coleta encerrada. Agregados liberados se atingirem o mínimo de respostas.");
  } catch (error) { say(error.message, true); }
  finally { button.disabled = false; }
});
$("finalizeForm").addEventListener("submit", async event => {
  event.preventDefault();
  const form = event.currentTarget;
  if (!form.reportValidity() || !selected) return;
  if (!confirm("Finalizar tecnicamente este ciclo? O inventário ficará bloqueado para novos registros.")) return;
  const button = form.querySelector("button"); button.disabled = true;
  try {
    const id = selected.id;
    await api(`/therapy/admin/nr1/campaigns/${id}`, { method: "PATCH", body: JSON.stringify({
      status: "finalized", reviewerName: form.elements.reviewerName.value,
      reviewerCredential: form.elements.reviewerCredential.value,
      technicalConclusion: form.elements.technicalConclusion.value,
      confirmTechnicalResponsibility: form.elements.confirmTechnicalResponsibility.checked
    }) });
    await loadCampaigns(); await selectCampaign(id); say("Ciclo finalizado tecnicamente.");
  } catch (error) {
    const details = error.details || {};
    const parts = [
      details.missingUnits?.length ? `unidades sem observação: ${details.missingUnits.join(", ")}` : "",
      details.pendingRiskReviews?.length ? `${details.pendingRiskReviews.length} risco(s) sem revisão` : "",
      details.risksWithoutAction?.length ? `${details.risksWithoutAction.length} risco(s) sem ação` : "",
      details.invalidEncryptedResponses ? `${details.invalidEncryptedResponses} resposta(s) cifrada(s) inválida(s)` : "",
      details.missingCommunication ? "devolutiva ausente" : "",
      details.missingAepPgrIntegration ? "integração AEP/PGR ausente" : ""
    ].filter(Boolean);
    say(parts.length ? `Não foi possível finalizar: ${parts.join("; ")}.` : error.message, true);
  } finally { button.disabled = false; }
});
$("adminLoginForm").addEventListener("submit", async event => {
  event.preventDefault();
  const form = event.currentTarget;
  if (!form.reportValidity()) return;
  const button = form.querySelector("button[type=submit]");
  button.disabled = true;
  try {
    await signInWithEmailAndPassword(auth, form.elements.email.value.trim(), form.elements.password.value);
    form.elements.password.value = "";
    await refreshAccess();
  } catch {
    $("accessMessage").textContent = "Não foi possível entrar. Confira o e-mail e a senha da conta administradora.";
  } finally { button.disabled = false; }
});
$("retryAccess").addEventListener("click", refreshAccess);
$("signOutAdmin").addEventListener("click", () => signOut(auth).catch(() => {
  $("accessMessage").textContent = "Não foi possível sair da conta atual. Tente novamente.";
}));
setTimeout(() => {
  if (!$("adminWorkspace").hidden) return;
  if ($("accessMessage").textContent.startsWith("Verificando")) {
    $("accessMessage").textContent = "A verificação da sessão está demorando. Entre com a conta administradora ou atualize a página.";
  }
}, 5000);
onAuthStateChanged(auth, user => {
  if (!user) { showAccess(); return; }
  refreshAccess();
});
