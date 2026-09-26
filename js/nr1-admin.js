import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";
import { auth, BACKEND_BASE_URL } from "./firebase-config.js";

const $ = id => document.getElementById(id);
let campaigns = [];
let selected = null;
function say(message, error = false) { $("message").textContent = message; $("message").style.color = error ? "#9b462d" : "#2d6a3e"; }
async function api(path, options = {}) {
  const user = auth.currentUser;
  if (!user) throw new Error("Faça login no painel administrativo.");
  const token = await user.getIdToken();
  const response = await fetch(`${BACKEND_BASE_URL}${path}`, {
    ...options, headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || `Erro HTTP ${response.status}`);
  return data;
}
function element(tag, text = "", cls = "") {
  const node = document.createElement(tag); node.textContent = text; node.className = cls; return node;
}
async function loadCompanies() {
  const data = await api("/therapy/admin/empresas?status=ativa");
  $("company").replaceChildren(new Option("Selecione", ""));
  (data.items || []).forEach(item => $("company").add(new Option(item.nome || item.name || item.id, item.id)));
  if (new URLSearchParams(location.search).get("empresa")) {
    $("company").value = new URLSearchParams(location.search).get("empresa");
    await loadCampaigns();
  }
  say("Selecione uma empresa para começar.");
}
async function loadCampaigns() {
  const companyId = $("company").value;
  selected = null; $("details").hidden = true;
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
  $("risks").replaceChildren();
  $("risks").append(element("h3", "Revisão dos riscos preliminares"));
  if (!data.risks.length) $("risks").append(element("p", "Ainda não há riscos registrados pela empresa.", "nr-small"));
  for (const risk of data.risks) {
    const card = element("div", "", "nr-item");
    card.append(element("strong", `${risk.description} · ${risk.technicalReview === "reviewed" ? "revisto" : "pendente"}`),
      element("p", `${risk.workActivity} · ${risk.exposure} · Severidade ${risk.severity} / Probabilidade ${risk.likelihood}`, "nr-small"),
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
      methodology: form.elements.methodology.value, reviewedInstrument: form.elements.reviewedInstrument.checked
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
onAuthStateChanged(auth, async user => {
  if (!user) { location.replace("./admin-empresas.html"); return; }
  try { await loadCompanies(); } catch (error) { say(error.message, true); }
});
