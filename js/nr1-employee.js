import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";
import { auth, BACKEND_BASE_URL } from "./firebase-config.js";

const $ = id => document.getElementById(id);
let campaigns = [];
let questions = [];
let user = null;

function message(text, error = false) {
  $("status").textContent = text;
  $("status").style.color = error ? "#9b462d" : "#2d6a3e";
}
async function api(path, options = {}) {
  const token = await user.getIdToken();
  const response = await fetch(`${BACKEND_BASE_URL}${path}`, {
    ...options, headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || `Erro HTTP ${response.status}`);
  return data;
}
function fillUnits() {
  const campaign = campaigns.find(item => item.id === $("campaign").value);
  $("unit").replaceChildren(new Option("Selecione sua unidade", ""));
  campaign?.units.forEach(unit => $("unit").add(new Option(unit.name, unit.id)));
}
function render(data) {
  campaigns = data.campaigns;
  questions = data.questions;
  if (!campaigns.length) {
    message("Nenhuma pesquisa aberta para sua empresa no momento.");
    return;
  }
  $("campaign").replaceChildren(...campaigns.map(item => new Option(item.name, item.id)));
  fillUnits();
  $("questions").replaceChildren();
  questions.forEach((question, index) => {
    const section = document.createElement("fieldset");
    section.className = "nr-question";
    const legend = document.createElement("legend");
    legend.textContent = `${index + 1}. ${question.text}`;
    const choices = document.createElement("div");
    choices.className = "nr-options";
    for (let value = 1; value <= 5; value++) {
      const label = document.createElement("label");
      const radio = document.createElement("input");
      radio.type = "radio"; radio.name = question.id; radio.value = String(value);
      if (value === 1) radio.required = true;
      label.append(radio, document.createTextNode(String(value)));
      choices.append(label);
    }
    section.append(legend, choices);
    $("questions").append(section);
  });
  $("surveyForm").hidden = false;
  message("Sua resposta será enviada de forma confidencial.");
}
$("campaign").addEventListener("change", fillUnits);
$("surveyForm").addEventListener("submit", async event => {
  event.preventDefault();
  if (!$("surveyForm").reportValidity()) return;
  const answers = {};
  for (const question of questions) {
    const checked = document.querySelector(`input[name="${question.id}"]:checked`);
    if (!checked) { message("Responda todas as perguntas.", true); return; }
    answers[question.id] = Number(checked.value);
  }
  const button = $("submit"); button.disabled = true;
  try {
    await api(`/therapy/paciente/nr1/campaigns/${$("campaign").value}/responses`, {
      method: "POST", body: JSON.stringify({ unitId: $("unit").value, answers })
    });
    $("surveyForm").hidden = true;
    message("Resposta recebida. Obrigado por participar. A empresa verá somente resultados agregados após o encerramento.");
  } catch (error) {
    message(error.message === "RESPOSTA_JA_ENVIADA" ? "Sua resposta já foi registrada nesta pesquisa." : error.message, true);
    button.disabled = false;
  }
});
onAuthStateChanged(auth, async currentUser => {
  if (!currentUser) {
    message("Entre na sua conta de colaborador para participar da pesquisa.", true);
    const link = document.createElement("a"); link.href = "./paciente-login.html";
    link.textContent = "Entrar na conta"; $("status").append(document.createTextNode(" "), link);
    return;
  }
  user = currentUser;
  try { render(await api("/therapy/paciente/nr1/campaigns")); }
  catch (error) { message(error.message, true); }
});
