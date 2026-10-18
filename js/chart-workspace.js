import { encryptNote, decryptNote } from "./crypto.js";

export const CHART_COPY = {
  overview: "Visão geral", entries: "Evoluções", clinical: "História clínica", monitoring: "Acompanhamento", documents: "Documentos", registration: "Cadastro",
  workspace: "Área de trabalho clínica", patientSummary: "Resumo do paciente", newEntry: "Nova evolução", record: "Registro clínico", overviewTitle: "Visão geral do cuidado", overviewSub: "Contexto, continuidade e próximos passos em um só lugar.",
  clinicalContext: "Contexto clínico", contextSub: "Informações registradas pelo profissional responsável.", allergies: "Alergias e reações", medications: "Medicamentos em uso", problems: "Condições e questões em acompanhamento", history: "Antecedentes pessoais", family: "História familiar", lifestyle: "Rotina e contexto de vida", alerts: "Alertas para o atendimento", carePlan: "Plano de cuidado", goals: "Objetivos do cuidado", actions: "Próximos passos", reviewDate: "Revisar o plano em", noPlan: "Registre os objetivos e combine os próximos passos do cuidado.",
  notRecorded: "Não informado", noneReported: "Nenhuma relatada", noneInUse: "Nenhum informado em uso", reported: "Informações registradas", status: "Situação", save: "Salvar alterações", saving: "Salvando…", saved: "Alterações salvas", loadError: "Não foi possível carregar estes dados. Tente novamente.", saveError: "Não foi possível salvar. Seu texto foi preservado.", conflict: "O prontuário foi alterado em outra aba. Seu texto foi preservado. Recarregue os dados antes de editar novamente.", reload: "Recarregar dados", reloadConfirm: "Recarregar substituirá as alterações deste formulário pelos dados salvos. Continuar?",
  summary: "Síntese do acompanhamento", summaryHint: "Demanda, contexto e pontos essenciais para a continuidade do cuidado.", overviewEmpty: "Complete a história clínica para ter o contexto do paciente sempre à mão.", editClinical: "Atualizar história clínica", nextAppointment: "Próximo atendimento", noAppointment: "Nenhum atendimento agendado", completed: "Atendimentos concluídos", records: "Evoluções registradas", lastRecord: "Registro mais recente", noRecords: "O cuidado começa com um bom registro.", noRecordsSub: "Documente uma avaliação, um atendimento presencial ou a continuidade de uma consulta online.",
  search: "Buscar no prontuário", searchHint: "Buscar nas evoluções carregadas…", allTypes: "Todos os modelos", noMatches: "Nenhum registro corresponde à busca.", loadMore: "Carregar registros anteriores", progress: "Evolução multiprofissional", soap: "SOAP", dap: "DAP", assessment: "Avaliação inicial", care_plan: "Plano de cuidado", free: "Texto livre", addendum: "Complemento de registro", template: "Modelo de registro", title: "Título do registro", occurredAt: "Data e hora do atendimento", linkedSession: "Vincular a uma consulta", independent: "Registro independente / atendimento presencial", content: "Registro", subjective: "Subjetivo — relato e contexto", objective: "Objetivo — observações e dados", assessmentField: "Avaliação profissional", plan: "Plano e conduta", data: "Dados do atendimento", complaint: "Demanda e contexto", intervention: "Intervenções realizadas", response: "Resposta e evolução", findings: "Achados e observações", publishedAt: "Registrado em", author: "Profissional responsável", complement: "Adicionar complemento", complementOf: "Complemento do registro", original: "Ver registro original", immutable: "Após salvar, o registro é preservado. Correções são feitas por um complemento vinculado ao original.", cancel: "Fechar", saveEntry: "Salvar registro", required: "Informe um título e o conteúdo do registro.", invalidDate: "Informe uma data válida que não esteja no futuro.", noSession: "Não foi possível carregar as consultas. Você ainda pode fazer um registro independente.",
  draftSaved: "Rascunho cifrado salvo nesta aba", draftSaving: "Salvando rascunho…", draftFailed: "O rascunho está apenas no formulário. Salve o registro antes de sair.", restored: "Seu rascunho foi restaurado", closeDirty: "Há um registro não salvo. Fechar o editor e manter o rascunho nesta aba?", discard: "Descartar rascunho", discardConfirm: "Descartar este rascunho? O conteúdo ainda não salvo será removido.", templateChanged: "O texto anterior foi preservado no primeiro campo do novo modelo.",
  name: "Nome completo ou nome usado no atendimento", socialName: "Nome social / nome de preferência", birthdate: "Data de nascimento", contact: "Contato principal", email: "E-mail", phone: "Telefone / WhatsApp", cpf: "CPF (opcional)", occupation: "Profissão / ocupação", address: "Endereço", city: "Cidade", state: "UF / região", postalCode: "CEP", paymentType: "Modalidade de pagamento", private: "Particular", insurance: "Convênio", unspecified: "Não informado", guardian: "Responsável pelo paciente", guardianName: "Nome do responsável", relationship: "Vínculo / parentesco", guardianContact: "Contato do responsável", emergency: "Contato de emergência", emergencyName: "Nome do contato", emergencyPhone: "Telefone de emergência", observations: "Observações do cadastro", identity: "Identificação e contato", addressGroup: "Endereço e contexto", optional: "Preencha apenas as informações necessárias ao atendimento.",
  recent: "Últimas evoluções", viewAll: "Ver histórico completo", sessionHistory: "Consultas e anotações anteriores", documentsTitle: "Documentos do paciente", documentsSub: "Receitas e documentos clínicos vinculados a este prontuário.", createDocument: "Novo documento clínico", noDocuments: "Nenhum documento clínico vinculado.", open: "Abrir documento", signed: "Assinado", documentDraft: "Rascunho", document: "Documento clínico", locked: "Conteúdo clínico cifrado", continuity: "Continuidade do cuidado", needsReview: "Revisão do plano pendente", reviewed: "Próxima revisão", recordCount: "{{count}} registros carregados", conflictDraft: "Há alterações não salvas", loading: "Carregando…", exportIncomplete: "Não foi possível carregar todos os registros para exportação.", monitoringEmpty: "As escalas respondidas e os recursos de acompanhamento deste paciente aparecerão aqui quando estiverem disponíveis.",
};

const TEMPLATES = {
  progress: ["complaint", "intervention", "response", "plan"], soap: ["subjective", "objective", "assessmentField", "plan"],
  dap: ["data", "assessmentField", "plan"], assessment: ["complaint", "history", "findings", "plan"],
  care_plan: ["goals", "actions", "reviewDate"], free: ["content"], addendum: ["content"]
};
const escape = value => String(value ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const localDateTime = value => {
  const d = new Date(value); return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
};

export function createChartWorkspace({ patientId, user, therapist, dek, backendBaseUrl, tr, locale, onPatientSaved, capabilities = [] }) {
  const t = (key, vars) => tr("chart:" + key, CHART_COPY[key] || key, vars);
  const $ = id => document.getElementById(id);
  const base = "/therapy/pacientes/" + encodeURIComponent(patientId);
  let patient = null, sessions = [], clinical = {}, version = 0, profileLoaded = false, sessionLoaded = false;
  let entries = [], nextCursor = null, listLoaded = false, editorDirty = false, editorPending = null, parentEntryId = null;
  let profileDirty = false, patientDirty = false, entryLoadPromise = null, profileLoadPromise = null;
  let draftTimer, draftGeneration = 0, entrySaving = false, memoryDraft = null;
  const draftKey = `ep:chart-draft:${user.uid}:${patientId}`;
  const removeDraft = () => { try { sessionStorage.removeItem(draftKey); } catch {} };
  const fmt = value => value ? new Date(value).toLocaleString(locale(), { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) : t("notRecorded");

  async function api(path, options = {}) {
    const token = await user.getIdToken();
    const response = await fetch(backendBaseUrl + path, { ...options, cache: "no-store", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, ...options.headers } });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || !data.ok) throw Object.assign(new Error(data.error || `HTTP_${response.status}`), { status: response.status });
    return data;
  }
  function status(el, key, error = false) { el.textContent = t(key); el.classList.toggle("is-error", error); }
  const input = (id, key, { type = "text", value = "", max = 250, wide = false } = {}) => `<label class="chart-field${wide ? " chart-field--wide" : ""}"><span>${escape(t(key))}</span><input id="${id}" name="${key}" type="${type}" maxlength="${max}" value="${escape(value)}" autocomplete="off"></label>`;
  const textarea = (id, key, rows = 3) => `<label class="chart-field chart-field--wide"><span>${escape(t(key))}</span><textarea id="${id}" name="${key}" rows="${rows}" maxlength="6000"></textarea></label>`;
  const option = (value, key) => `<option value="${value}">${escape(t(key))}</option>`;

  const main = document.querySelector("main");
  main.classList.add("chart-main"); document.body.classList.add("chart-page");
  const shell = document.createElement("div"); shell.className = "chart-shell";
  shell.innerHTML = `
    <div class="chart-toolbar">
      <nav class="chart-nav" aria-label="${escape(t("workspace"))}" role="tablist" aria-orientation="horizontal">
        ${["overview", "entries", "clinical", "monitoring", "documents", "registration"].map((key, i) => `<button type="button" id="chart-tab-${key}" role="tab" aria-selected="${i === 0}" aria-controls="chart-panel-${key}" tabindex="${i ? -1 : 0}" data-chart-tab="${key}"><span class="chart-nav__icon" aria-hidden="true">${["◫", "≡", "+", "↗", "▤", "◎"][i]}</span>${escape(t(key))}<span class="chart-nav__mark" id="chart-count-${key}"></span></button>`).join("")}
      </nav>
    </div>
    <div class="chart-content">
      <section id="chart-panel-overview" class="chart-panel" role="tabpanel" aria-labelledby="chart-tab-overview" tabindex="0">
        <div class="chart-section-head"><div><h2>${escape(t("overviewTitle"))}</h2><p>${escape(t("overviewSub"))}</p></div><div class="chart-security-note"><span aria-hidden="true">◈</span><span>${escape(t("locked"))}</span></div></div>
        <div class="chart-metrics" id="chartMetrics"></div>
        <div class="chart-overview-grid">
          <article class="chart-card chart-context"><header><h3>${escape(t("clinicalContext"))}</h3><button type="button" class="chart-text-button" data-go="clinical">${escape(t("editClinical"))} ↗</button></header><div id="chartContext"></div></article>
          <article class="chart-card"><header><h3>${escape(t("carePlan"))}</h3><span class="chart-card__index">02</span></header><div id="chartCarePlan"></div></article>
        </div>
        <article class="chart-card chart-recent"><header><div><div class="chart-eyebrow">${escape(t("continuity"))}</div><h3>${escape(t("recent"))}</h3></div><button type="button" class="chart-text-button" data-go="entries">${escape(t("viewAll"))} →</button></header><div id="chartRecent"></div></article>
      </section>
      <section id="chart-panel-entries" class="chart-panel" role="tabpanel" aria-labelledby="chart-tab-entries" tabindex="0" hidden>
        <div class="chart-section-head"><div><div class="chart-eyebrow">${escape(t("continuity"))}</div><h2>${escape(t("entries"))}</h2></div><button type="button" class="chart-button chart-button--primary" data-new-entry>＋ ${escape(t("newEntry"))}</button></div>
        <div class="chart-search"><label><span class="chart-sr-only">${escape(t("search"))}</span><input type="search" id="chartSearch" placeholder="${escape(t("searchHint"))}" autocomplete="off"></label><select id="chartTypeFilter" aria-label="${escape(t("template"))}">${option("", "allTypes")}${Object.keys(TEMPLATES).map(key => option(key, key)).join("")}</select></div>
        <div class="chart-list-status"><p id="chartEntryStatus" class="chart-status" role="status"></p><button type="button" id="chartReloadEntries" class="chart-text-button">${escape(t("reload"))}</button></div><div id="chartEntries" class="chart-entry-list"></div><button type="button" id="chartLoadMore" class="chart-button chart-more" hidden>${escape(t("loadMore"))}</button>
        <div id="chartLegacySessions" class="chart-legacy"></div>
      </section>
      <section id="chart-panel-clinical" class="chart-panel" role="tabpanel" aria-labelledby="chart-tab-clinical" tabindex="0" hidden>
        <div class="chart-section-head"><div><div class="chart-eyebrow">${escape(t("clinicalContext"))}</div><h2>${escape(t("clinical"))}</h2><p>${escape(t("contextSub"))}</p></div></div>
        <form id="chartClinicalForm" class="chart-form">
          <article class="chart-card"><h3>${escape(t("summary"))}</h3><div class="chart-form-grid">${textarea("chartSummary", "summary", 4)}${textarea("chartProblems", "problems")}${textarea("chartAlerts", "alerts", 2)}</div></article>
          <div class="chart-overview-grid"><article class="chart-card"><h3>${escape(t("allergies"))}</h3><label class="chart-field"><span>${escape(t("status"))}</span><select id="chartAllergyStatus">${option("unknown", "notRecorded")}${option("none", "noneReported")}${option("reported", "reported")}</select></label>${textarea("chartAllergies", "allergies")}</article><article class="chart-card"><h3>${escape(t("medications"))}</h3><label class="chart-field"><span>${escape(t("status"))}</span><select id="chartMedicationStatus">${option("unknown", "notRecorded")}${option("none", "noneInUse")}${option("reported", "reported")}</select></label>${textarea("chartMedications", "medications")}</article></div>
          <article class="chart-card"><h3>${escape(t("history"))}</h3><div class="chart-form-grid">${textarea("chartHistory", "history")}${textarea("chartFamily", "family")}${textarea("chartLifestyle", "lifestyle")}</div></article>
          <article class="chart-card"><h3>${escape(t("carePlan"))}</h3><div class="chart-form-grid">${textarea("chartGoals", "goals")}${textarea("chartActions", "actions")}${input("chartReviewDate", "reviewDate", { type: "date" })}</div></article>
          <div class="chart-savebar"><p id="chartClinicalStatus" class="chart-status" role="status"></p><button type="button" class="chart-button" id="chartReloadProfile">${escape(t("reload"))}</button><button type="submit" class="chart-button chart-button--primary" id="chartSaveClinical">${escape(t("save"))}</button></div>
        </form>
      </section>
      <section id="chart-panel-monitoring" class="chart-panel" role="tabpanel" aria-labelledby="chart-tab-monitoring" tabindex="0" hidden><div class="chart-section-head"><div><div class="chart-eyebrow">${escape(t("continuity"))}</div><h2>${escape(t("monitoring"))}</h2></div></div><div id="chartMonitoring"></div></section>
      <section id="chart-panel-documents" class="chart-panel" role="tabpanel" aria-labelledby="chart-tab-documents" tabindex="0" hidden><div class="chart-section-head"><div><div class="chart-eyebrow">${escape(t("documents"))}</div><h2>${escape(t("documentsTitle"))}</h2><p>${escape(t("documentsSub"))}</p></div><a class="chart-button chart-button--primary" data-capability="documentos-clinicos" href="./documento.html?patientId=${encodeURIComponent(patientId)}">＋ ${escape(t("createDocument"))}</a></div><div id="chartDocuments" class="chart-card"></div><div id="chartPrescriptions"></div><div id="chartRecordings"></div></section>
      <section id="chart-panel-registration" class="chart-panel" role="tabpanel" aria-labelledby="chart-tab-registration" tabindex="0" hidden><div class="chart-section-head"><div><div class="chart-eyebrow">${escape(t("registration"))}</div><h2>${escape(t("identity"))}</h2><p>${escape(t("optional"))}</p></div></div>
        <form id="chartPatientForm" class="chart-form">
          <article class="chart-card"><h3>${escape(t("identity"))}</h3><div class="chart-form-grid">${input("chartPatientName", "name", { wide: true, max: 80 })}${input("chartSocialName", "socialName")}${input("chartBirthdate", "birthdate", { type: "date" })}${input("chartContact", "contact", { max: 120 })}${input("chartEmail", "email", { type: "email" })}${input("chartPhone", "phone", { type: "tel" })}${input("chartCpf", "cpf", { max: 20 })}${input("chartOccupation", "occupation")}<label class="chart-field"><span>${escape(t("paymentType"))}</span><select id="chartPaymentType">${option("unspecified", "unspecified")}${option("private", "private")}${option("insurance", "insurance")}</select></label></div></article>
          <article class="chart-card"><h3>${escape(t("addressGroup"))}</h3><div class="chart-form-grid">${input("chartAddress", "address", { wide: true, max: 400 })}${input("chartCity", "city")}${input("chartState", "state", { max: 60 })}${input("chartPostalCode", "postalCode", { max: 20 })}</div></article>
          <article class="chart-card"><h3>${escape(t("guardian"))}</h3><div class="chart-form-grid">${input("chartGuardianName", "guardianName")}${input("chartGuardianRelation", "relationship")}${input("chartGuardianContact", "guardianContact", { type: "tel" })}</div></article>
          <article class="chart-card"><h3>${escape(t("emergency"))}</h3><div class="chart-form-grid">${input("chartEmergencyName", "emergencyName")}${input("chartEmergencyPhone", "emergencyPhone", { type: "tel" })}${textarea("chartPatientObservations", "observations")}</div></article>
          <div class="chart-savebar"><p id="chartPatientStatus" class="chart-status" role="status"></p><button type="button" id="chartReloadPatient" class="chart-button">${escape(t("reload"))}</button><button type="submit" id="chartSavePatient" class="chart-button chart-button--primary">${escape(t("save"))}</button></div>
        </form>
      </section>
    </div>`;
  const originalObs = $("patientObs").closest("section");
  originalObs.hidden = true;
  const historySection = $("sessions").closest("section");
  const prescriptionSection = $("receitasList").closest("section");
  main.appendChild(shell);
  main.querySelector('.chart-boot')?.remove();
  main.dataset.chartReady = '';
  const identity = document.createElement("dl"); identity.id = "chartIdentity"; identity.className = "chart-patient-details";
  document.querySelector(".ep-prontuario__title").appendChild(identity);
  if (!capabilities.includes("documentos-clinicos")) shell.querySelector('[data-capability="documentos-clinicos"]').hidden = true;
  $("chartPatientName").required = true;
  $("chartLegacySessions").appendChild(historySection);
  historySection.classList.add("chart-card");
  historySection.querySelector("h2").textContent = t("sessionHistory");
  const monitoringSections = ["escalasBlock", "jornadaBlock", "mapaEmocionalBlock", "gemeoClinicoBlock"].map(id => $(id));
  monitoringSections.forEach(section => $("chartMonitoring").appendChild(section));
  const monitoringEmpty = document.createElement("div"); monitoringEmpty.className = "chart-card chart-empty-copy"; monitoringEmpty.textContent = t("monitoringEmpty"); $("chartMonitoring").appendChild(monitoringEmpty);
  const monitorVisibility = () => { monitoringEmpty.hidden = monitoringSections.some(section => !section.classList.contains("ep-hide") && !section.hidden); };
  const monitorObserver = new MutationObserver(monitorVisibility);
  monitoringSections.forEach(section => monitorObserver.observe(section, { attributes: true, attributeFilter: ["class", "hidden"] }));
  monitorVisibility();
  $("chartPrescriptions").appendChild(prescriptionSection);
  $("chartRecordings").appendChild($("gravacaoSection"));
  const topButton = document.createElement("button"); topButton.type = "button"; topButton.className = "chart-button chart-button--primary"; topButton.textContent = "＋ " + t("newEntry"); topButton.dataset.newEntry = "";
  document.querySelector(".ep-prontuario__actions").prepend(topButton);
  if (!capabilities.includes("receita")) $("newReceitaLink").hidden = true;
  document.querySelectorAll("[data-new-entry]").forEach(button => { button.disabled = true; });
  for (const form of [$("chartClinicalForm"), $("chartPatientForm")]) form.querySelectorAll(".chart-card input,.chart-card select,.chart-card textarea").forEach(field => { field.disabled = true; });
  $("chartSavePatient").disabled = true;
  $("statsStrip").classList.add("chart-legacy-stats");
  $("editPatientBtn").addEventListener("click", e => { e.preventDefault(); activate("registration"); });

  function activate(key, focus = false) {
    const toolbar = shell.querySelector(".chart-toolbar");
    const toolbarTop = Number.parseFloat(getComputedStyle(toolbar).top) || 0;
    const shouldScroll = shell.getBoundingClientRect().top < toolbarTop;
    shell.querySelectorAll("[data-chart-tab]").forEach(button => {
      const active = button.dataset.chartTab === key;
      button.setAttribute("aria-selected", String(active)); button.tabIndex = active ? 0 : -1;
      if (active && focus) button.focus();
    });
    shell.querySelectorAll(".chart-panel").forEach(panel => { panel.hidden = panel.id !== "chart-panel-" + key; });
    if (shouldScroll) shell.scrollIntoView({ block: "start" });
    if (key === "monitoring") window.dispatchEvent(new Event("resize"));
    if (key === "documents") loadDocuments();
  }
  shell.querySelectorAll("[data-chart-tab]").forEach(button => {
    button.addEventListener("click", () => activate(button.dataset.chartTab));
    button.addEventListener("keydown", event => {
      if (!["ArrowDown", "ArrowUp", "ArrowRight", "ArrowLeft", "Home", "End"].includes(event.key)) return;
      event.preventDefault(); const tabs = [...shell.querySelectorAll("[data-chart-tab]")]; const index = tabs.indexOf(button);
      const next = event.key === "Home" ? 0 : event.key === "End" ? tabs.length - 1 : (index + (["ArrowUp", "ArrowLeft"].includes(event.key) ? -1 : 1) + tabs.length) % tabs.length;
      activate(tabs[next].dataset.chartTab, true);
    });
  });
  shell.querySelectorAll("[data-go]").forEach(button => button.addEventListener("click", () => activate(button.dataset.go)));

  function renderIdentity() {
    if (!patient) return;
    $("chartIdentity").innerHTML = `<div><dt>${escape(t("birthdate"))}</dt><dd>${escape(patient.birthdate ? new Date(patient.birthdate + "T12:00:00").toLocaleDateString(locale()) : t("notRecorded"))}</dd></div>`;
    const p = patient, d = p.demographics || {}, guardian = p.guardian || {}, emergency = p.emergencyContact || {};
    if (!patientDirty) {
      const fields = { chartPatientName: p.name, chartSocialName: p.socialName, chartBirthdate: p.birthdate, chartContact: p.contact, chartEmail: d.email, chartPhone: d.phone, chartCpf: d.cpf, chartOccupation: d.occupation, chartAddress: d.address, chartCity: d.city, chartState: d.state, chartPostalCode: d.postalCode, chartGuardianName: guardian.name, chartGuardianRelation: guardian.relationship, chartGuardianContact: guardian.contact, chartEmergencyName: emergency.name, chartEmergencyPhone: emergency.phone, chartPatientObservations: p.observations };
      for (const [id, value] of Object.entries(fields)) $(id).value = value || "";
      $("chartPaymentType").value = ["private", "insurance"].includes(p.paymentType) ? p.paymentType : "unspecified";
    }
  }
  function renderOverview() {
    const next = sessions.filter(s => ["scheduled", "in_progress"].includes(s.status) && Number(s.scheduledAt) >= Date.now()).sort((a, b) => a.scheduledAt - b.scheduledAt)[0];
    $("chartMetrics").innerHTML = [["completed", sessionLoaded ? sessions.filter(s => s.status === "completed").length : "—", "01"], ["records", listLoaded ? entries.length + (nextCursor ? "+" : "") : "—", "02"], ["nextAppointment", next ? fmt(next.scheduledAt) : sessionLoaded ? t("noAppointment") : t("loading"), "03"]].map(([label, value, index]) => `<div class="chart-metric"><span>${escape(t(label))}</span><strong>${escape(value)}</strong><i aria-hidden="true">${index}</i></div>`).join("");
    if (profileLoaded) {
      const box = (title, value, kind = "") => `<div class="chart-context-item ${kind}"><span>${escape(t(title))}</span><p>${escape(value || t("notRecorded"))}</p></div>`;
      $("chartContext").innerHTML = (clinical.summary ? `<p class="chart-context-summary">${escape(clinical.summary)}</p>` : `<p class="chart-empty-copy">${escape(t("overviewEmpty"))}</p>`) + box("allergies", clinical.allergyStatus === "none" ? t("noneReported") : clinical.allergyStatus === "reported" ? clinical.allergies : "", clinical.allergyStatus === "reported" ? "is-attention" : "") + box("medications", clinical.medicationStatus === "none" ? t("noneInUse") : clinical.medicationStatus === "reported" ? clinical.medications : "") + (clinical.problems ? box("problems", clinical.problems) : "") + (clinical.alerts ? box("alerts", clinical.alerts, "is-attention") : "");
      const date = clinical.reviewDate, overdue = date && date < new Date().toLocaleDateString("en-CA");
      $("chartCarePlan").innerHTML = clinical.goals || clinical.actions ? `<div class="chart-plan-goals"><span>${escape(t("goals"))}</span><p>${escape(clinical.goals || t("notRecorded"))}</p></div><ul class="chart-plan-actions">${String(clinical.actions || "").split("\n").filter(Boolean).map(action => `<li><span aria-hidden="true">○</span>${escape(action)}</li>`).join("")}</ul>${date ? `<div class="chart-review ${overdue ? "is-attention" : ""}"><span>${escape(t(overdue ? "needsReview" : "reviewed"))}</span><strong>${escape(new Date(date + "T12:00:00").toLocaleDateString(locale()))}</strong></div>` : ""}` : `<div class="chart-plan-empty"><span aria-hidden="true">↗</span><p>${escape(t("noPlan"))}</p><button type="button" class="chart-text-button" id="chartAddPlan">${escape(t("editClinical"))} →</button></div>`;
      $("chartAddPlan")?.addEventListener("click", () => { activate("clinical"); $("chartGoals").focus(); });
    }
    renderEntries();
  }
  function fillClinical() {
    const fields = { chartSummary: "summary", chartProblems: "problems", chartAlerts: "alerts", chartAllergies: "allergies", chartMedications: "medications", chartHistory: "history", chartFamily: "family", chartLifestyle: "lifestyle", chartGoals: "goals", chartActions: "actions", chartReviewDate: "reviewDate" };
    for (const [id, key] of Object.entries(fields)) $(id).value = clinical[key] || "";
    $("chartAllergyStatus").value = ["none", "reported"].includes(clinical.allergyStatus) ? clinical.allergyStatus : "unknown";
    $("chartMedicationStatus").value = ["none", "reported"].includes(clinical.medicationStatus) ? clinical.medicationStatus : "unknown";
  }
  function syncConditionalFields() {
    $("chartAllergies").disabled = !profileLoaded || $("chartAllergyStatus").value !== "reported";
    $("chartMedications").disabled = !profileLoaded || $("chartMedicationStatus").value !== "reported";
  }
  $("chartAllergyStatus").addEventListener("change", syncConditionalFields);
  $("chartMedicationStatus").addEventListener("change", syncConditionalFields);
  async function loadProfile() {
    if (profileDirty && profileLoaded) return;
    if (profileLoadPromise) return profileLoadPromise;
    profileLoadPromise = (async () => {
      try {
        const data = await api(base + "/prontuario");
        const decrypted = data.exists ? JSON.parse(await decryptNote(data, dek)) : {};
        clinical = decrypted; version = data.version; profileLoaded = true;
        if (!profileDirty) fillClinical();
        $("chartClinicalForm").querySelectorAll(".chart-card input,.chart-card select,.chart-card textarea").forEach(field => { field.disabled = false; });
        syncConditionalFields();
        $("chartSaveClinical").disabled = false;
        renderOverview();
      } catch (error) {
        status($("chartClinicalStatus"), "loadError", true);
        $("chartContext").textContent = t("loadError"); $("chartCarePlan").textContent = t("loadError");
        throw error;
      } finally { profileLoadPromise = null; }
    })();
    return profileLoadPromise;
  }
  function entryElement(entry, compact = false) {
    const article = document.createElement("article"); article.className = "chart-entry"; article.id = compact ? "chart-recent-" + entry.entryId : "chart-entry-" + entry.entryId;
    const sections = Array.isArray(entry.sections) ? entry.sections : [];
    article.innerHTML = `<div class="chart-entry__date"><strong>${escape(new Date(entry.occurredAt || entry.createdAt).toLocaleDateString(locale(), { day: "2-digit" }))}</strong><span>${escape(new Date(entry.occurredAt || entry.createdAt).toLocaleDateString(locale(), { month: "short" }))}</span></div><div class="chart-entry__main"><div class="chart-entry__meta"><span class="chart-entry__type">${escape(t(entry.kind))}</span><span>${escape(fmt(entry.occurredAt || entry.createdAt))}</span></div><h3>${escape(entry.title || t(entry.kind))}</h3>${compact ? `<p class="chart-entry__excerpt">${escape(sections.map(s => s.text).join(" ").slice(0, 180))}</p>` : `<div class="chart-entry__sections">${sections.filter(s => s.text).map(section => `<div><h4>${escape(section.label || t(section.key))}</h4><p>${escape(section.text)}</p></div>`).join("")}</div><footer><span>${escape(t("publishedAt"))} ${escape(fmt(entry.createdAt))} · ${escape(entry.authorName || therapist.displayName || "")}</span><button type="button" class="chart-text-button" data-complement>${escape(t("complement"))} ＋</button></footer>${entry.parentEntryId ? `<button type="button" class="chart-text-button" data-original>${escape(t("original"))} ↗</button>` : ""}`}</div>`;
    article.querySelector("[data-complement]")?.addEventListener("click", () => openEditor(entry));
    article.querySelector("[data-original]")?.addEventListener("click", async () => {
      while (!entries.some(e => e.entryId === entry.parentEntryId) && nextCursor) await loadEntries(true);
      const original = $("chart-entry-" + entry.parentEntryId);
      if (original) { original.scrollIntoView({ behavior: "smooth", block: "center" }); original.classList.add("is-highlight"); setTimeout(() => original.classList.remove("is-highlight"), 2500); }
    });
    return article;
  }
  function renderEntries() {
    const term = $("chartSearch").value.trim().toLocaleLowerCase(locale()); const type = $("chartTypeFilter").value;
    const filtered = entries.filter(entry => (!type || entry.kind === type) && (!term || [entry.title, ...(entry.sections || []).map(s => s.text)].join(" ").toLocaleLowerCase(locale()).includes(term)));
    const list = $("chartEntries"); list.replaceChildren();
    filtered.forEach(entry => list.appendChild(entryElement(entry)));
    if (!filtered.length && listLoaded) list.innerHTML = `<div class="chart-empty"><span aria-hidden="true">${term || type ? "⌕" : "＋"}</span><h3>${escape(t(term || type ? "noMatches" : "noRecords"))}</h3>${!term && !type ? `<p>${escape(t("noRecordsSub"))}</p>` : ""}</div>`;
    $("chartRecent").replaceChildren(...entries.slice(0, 3).map(entry => entryElement(entry, true)));
    if (!entries.length) $("chartRecent").innerHTML = `<p class="chart-empty-copy">${escape(t(listLoaded ? "noRecordsSub" : "loading"))}</p>`;
    $("chartLoadMore").hidden = !nextCursor;
    $("chart-count-entries").textContent = entries.length ? entries.length + (nextCursor ? "+" : "") : "";
  }
  async function loadEntries(more = false) {
    if (entryLoadPromise) return entryLoadPromise;
    entryLoadPromise = (async () => {
      status($("chartEntryStatus"), "loading");
      try {
        const cursor = more && nextCursor ? "&cursor=" + encodeURIComponent(nextCursor) : "";
        const data = await api(base + "/prontuario/registros?limit=50" + cursor);
        const decoded = await Promise.all(data.entries.map(async item => ({ ...JSON.parse(await decryptNote(item, dek)), ...item })));
        entries = more ? [...entries, ...decoded.filter(item => !entries.some(e => e.entryId === item.entryId))] : decoded;
        nextCursor = data.nextCursor; listLoaded = true;
        $("chartEntryStatus").textContent = t("recordCount", { count: entries.length });
        renderOverview();
      } catch (error) { status($("chartEntryStatus"), "loadError", true); if (!entries.length) $("chartRecent").textContent = t("loadError"); throw error; }
      finally { entryLoadPromise = null; }
    })();
    return entryLoadPromise;
  }
  $("chartSearch").addEventListener("input", renderEntries); $("chartTypeFilter").addEventListener("change", renderEntries);
  $("chartLoadMore").addEventListener("click", () => loadEntries(true).catch(() => {}));
  $("chartReloadEntries").addEventListener("click", () => loadEntries().catch(() => {}));
  $("chartClinicalForm").addEventListener("input", () => { profileDirty = true; status($("chartClinicalStatus"), "conflictDraft"); });
  $("chartPatientForm").addEventListener("input", () => { patientDirty = true; status($("chartPatientStatus"), "conflictDraft"); });
  $("chartSaveClinical").disabled = true;
  $("chartClinicalForm").addEventListener("submit", async event => {
    event.preventDefault(); if (!profileLoaded) return;
    const button = $("chartSaveClinical"); button.disabled = true; $("chartClinicalForm").inert = true; status($("chartClinicalStatus"), "saving");
    const fields = { summary: "chartSummary", problems: "chartProblems", alerts: "chartAlerts", allergies: "chartAllergies", medications: "chartMedications", history: "chartHistory", family: "chartFamily", lifestyle: "chartLifestyle", goals: "chartGoals", actions: "chartActions", reviewDate: "chartReviewDate", allergyStatus: "chartAllergyStatus", medicationStatus: "chartMedicationStatus" };
    const next = { ...clinical, ...Object.fromEntries(Object.entries(fields).map(([key, id]) => [key, $(id).value.trim()])) };
    if (next.allergyStatus !== "reported") next.allergies = "";
    if (next.medicationStatus !== "reported") next.medications = "";
    try {
      const encrypted = await encryptNote(JSON.stringify(next), dek);
      const result = await api(base + "/prontuario", { method: "PUT", body: JSON.stringify({ ...encrypted, expectedVersion: version }) });
      clinical = next; version = result.version; profileDirty = false; status($("chartClinicalStatus"), "saved"); renderOverview();
    } catch (error) { status($("chartClinicalStatus"), error.status === 409 ? "conflict" : "saveError", true); }
    finally { button.disabled = false; $("chartClinicalForm").inert = false; }
  });
  $("chartReloadProfile").addEventListener("click", async () => {
    if (profileDirty && !window.confirm(t("reloadConfirm"))) return;
    profileDirty = false; await loadProfile().catch(() => {});
  });
  $("chartPatientForm").addEventListener("submit", async event => {
    event.preventDefault(); if (!patient || !$("chartPatientName").value.trim()) return;
    const button = $("chartSavePatient"); button.disabled = true; $("chartPatientForm").inert = true; status($("chartPatientStatus"), "saving");
    const { patientId: _id, revision, createdAt, updatedAt, ...original } = patient;
    const next = { ...original, name: $("chartPatientName").value.trim(), socialName: $("chartSocialName").value.trim(), birthdate: $("chartBirthdate").value, contact: $("chartContact").value.trim(), observations: $("chartPatientObservations").value.trim(), paymentType: $("chartPaymentType").value,
      demographics: { ...patient.demographics, ...Object.fromEntries(["email", "phone", "cpf", "occupation", "address", "city", "state", "postalCode"].map(key => [key, $("chart" + key[0].toUpperCase() + key.slice(1)).value.trim()])) },
      guardian: { ...patient.guardian, name: $("chartGuardianName").value.trim(), relationship: $("chartGuardianRelation").value.trim(), contact: $("chartGuardianContact").value.trim() },
      emergencyContact: { ...patient.emergencyContact, name: $("chartEmergencyName").value.trim(), phone: $("chartEmergencyPhone").value.trim() } };
    try {
      const encrypted = await encryptNote(JSON.stringify(next), dek);
      const result = await api(base, { method: "PATCH", body: JSON.stringify({ ...encrypted, expectedRevision: revision || 0 }) });
      patient = { ...next, patientId, revision: result.revision, createdAt, updatedAt: Date.now() }; patientDirty = false;
      status($("chartPatientStatus"), "saved"); renderIdentity(); onPatientSaved?.(patient);
    } catch (error) { status($("chartPatientStatus"), error.status === 409 ? "conflict" : "saveError", true); }
    finally { button.disabled = false; $("chartPatientForm").inert = false; }
  });
  $("chartReloadPatient").addEventListener("click", async () => {
    if (patientDirty && !window.confirm(t("reloadConfirm"))) return;
    try {
      const data = await api(base);
      const payload = JSON.parse(await decryptNote(data.patient, dek));
      const millis = value => typeof value === "number" ? value : value?._seconds ? value._seconds * 1000 : null;
      patient = { ...payload, patientId, revision: data.patient.revision || 0, createdAt: millis(data.patient.createdAt), updatedAt: millis(data.patient.updatedAt) };
      patientDirty = false; renderIdentity(); onPatientSaved?.(patient); $("chartPatientStatus").textContent = "";
    } catch { status($("chartPatientStatus"), "loadError", true); }
  });

  const dialog = document.createElement("dialog"); dialog.className = "chart-editor"; dialog.setAttribute("aria-labelledby", "chartEditorTitle"); dialog.setAttribute("aria-describedby", "chartEntryNotice");
  dialog.innerHTML = `<form id="chartEntryForm"><header><div><span class="chart-eyebrow">${escape(t("record"))}</span><h2>${escape(t("newEntry"))}</h2></div><button type="button" class="chart-close" id="chartCloseEditor" aria-label="${escape(t("cancel"))}">×</button></header><div class="chart-editor__body"><div class="chart-form-grid"><label class="chart-field"><span>${escape(t("template"))}</span><select id="chartEntryTemplate">${Object.keys(TEMPLATES).filter(key => key !== "addendum").map(key => option(key, key)).join("")}${option("addendum", "addendum")}</select></label>${input("chartEntryDate", "occurredAt", { type: "datetime-local" })}${input("chartEntryTitle", "title", { wide: true, max: 160 })}<label class="chart-field chart-field--wide"><span>${escape(t("linkedSession"))}</span><select id="chartEntrySession"></select></label></div><div id="chartEntryFields" class="chart-form-grid"></div><p id="chartEntryNotice" class="chart-editor__notice">${escape(t("immutable"))}</p></div><footer><div><p id="chartEditorStatus" class="chart-status" role="status"></p><span id="chartDraftStatus" class="chart-draft-status" role="status"></span></div><div class="chart-editor__buttons"><button type="button" id="chartDiscardDraft" class="chart-button">${escape(t("discard"))}</button><button type="submit" id="chartSaveEntry" class="chart-button chart-button--primary">${escape(t("saveEntry"))}</button></div></footer></form>`;
  document.body.appendChild(dialog);
  dialog.querySelector("h2").id = "chartEditorTitle";
  function readEditor() {
    return { template: $("chartEntryTemplate").value, title: $("chartEntryTitle").value, occurredAt: $("chartEntryDate").value, sessionId: $("chartEntrySession").value, parentEntryId,
      sections: [...$("chartEntryFields").querySelectorAll("textarea")].map(el => ({ key: el.dataset.key, label: t(el.dataset.key), text: el.value })), pendingRequest: editorPending };
  }
  function renderEditorFields(template, sections = []) {
    $("chartEntryFields").innerHTML = (TEMPLATES[template] || TEMPLATES.free).map(key => textarea("chart-editor-" + key, key, template === "free" || template === "addendum" ? 10 : 4)).join("");
    $("chartEntryFields").querySelectorAll("textarea").forEach(el => { const key = el.name; el.dataset.key = key; el.value = sections.find(section => section.key === key)?.text || ""; });
  }
  function scheduleDraft() {
    editorDirty = true; editorPending = null; memoryDraft = readEditor(); const generation = ++draftGeneration; clearTimeout(draftTimer);
    $("chartDraftStatus").textContent = t("draftSaving");
    draftTimer = setTimeout(async () => {
      try {
        const encrypted = await encryptNote(JSON.stringify(readEditor()), dek);
        if (generation !== draftGeneration || !editorDirty) return;
        sessionStorage.setItem(draftKey, JSON.stringify(encrypted)); $("chartDraftStatus").textContent = t("draftSaved");
      } catch { $("chartDraftStatus").textContent = t("draftFailed"); }
    }, 400);
  }
  async function openEditor(parent = null) {
    if (!patient) return;
    let draft = memoryDraft;
    try { const stored = sessionStorage.getItem(draftKey); if (!draft && stored) draft = JSON.parse(await decryptNote(JSON.parse(stored), dek)); } catch { /* unreadable drafts never replace saved clinical records */ }
    if (parent && draft && !window.confirm(t("discardConfirm"))) return;
    if (parent) { draft = null; memoryDraft = null; draftGeneration++; clearTimeout(draftTimer); removeDraft(); }
    parentEntryId = parent?.entryId || draft?.parentEntryId || null;
    $("chartEntryTemplate").value = parent ? "addendum" : draft?.template || "progress";
    $("chartEntryTemplate").disabled = !!parentEntryId;
    $("chartEntryTitle").value = draft?.title || (parent ? t("complementOf") + ": " + parent.title : "");
    $("chartEntryDate").value = draft?.occurredAt || localDateTime(Date.now());
    $("chartEntrySession").innerHTML = option("", "independent") + sessions.map(session => `<option value="${escape(session.sessionId)}">${escape(fmt(session.scheduledAt || session.startedAt || session.createdAt))}</option>`).join("");
    $("chartEntrySession").value = draft?.sessionId || parent?.sessionId || "";
    renderEditorFields($("chartEntryTemplate").value, draft?.sections || []);
    $("chartEditorStatus").textContent = sessionLoaded ? "" : t("noSession");
    $("chartDraftStatus").textContent = draft ? t("restored") : "";
    editorDirty = !!draft; editorPending = draft?.pendingRequest || null;
    dialog.showModal(); $("chartEntryTitle").focus();
  }
  function closeEditor() { if (entrySaving) return; if (editorDirty && !window.confirm(t("closeDirty"))) return; if (editorDirty) memoryDraft = readEditor(); dialog.close(); }
  document.querySelectorAll("[data-new-entry]").forEach(button => button.addEventListener("click", () => openEditor()));
  $("chartCloseEditor").addEventListener("click", closeEditor);
  dialog.addEventListener("cancel", event => { event.preventDefault(); closeEditor(); });
  $("chartEntryForm").addEventListener("input", scheduleDraft);
  $("chartEntryTemplate").addEventListener("change", () => {
    const old = [...$("chartEntryFields").querySelectorAll("textarea")].map(el => ({ key: el.dataset.key, text: el.value })).filter(s => s.text.trim());
    const keys = TEMPLATES[$("chartEntryTemplate").value];
    const keep = old.every(section => keys.includes(section.key)) ? old : [{ key: keys[0], text: old.map(section => t(section.key) + "\n" + section.text).join("\n\n") }];
    renderEditorFields($("chartEntryTemplate").value, keep); if (old.length) status($("chartEditorStatus"), "templateChanged"); scheduleDraft();
  });
  $("chartDiscardDraft").addEventListener("click", () => {
    if (!window.confirm(t("discardConfirm"))) return;
    draftGeneration++; clearTimeout(draftTimer); removeDraft(); memoryDraft = null; editorDirty = false; editorPending = null; dialog.close();
  });
  $("chartEntryForm").addEventListener("submit", async event => {
    event.preventDefault(); if (entrySaving) return; const data = readEditor();
    if (!data.title.trim() || !data.sections.some(section => section.text.trim())) { status($("chartEditorStatus"), "required", true); return; }
    const occurredAt = new Date(data.occurredAt).getTime();
    if (!Number.isFinite(occurredAt) || occurredAt > Date.now() + 60000) { status($("chartEditorStatus"), "invalidDate", true); return; }
    draftGeneration++; clearTimeout(draftTimer);
    const button = $("chartSaveEntry"); button.disabled = true; entrySaving = true; $("chartEntryForm").inert = true; status($("chartEditorStatus"), "saving");
    try {
      if (!editorPending) {
        const payload = { title: data.title.trim(), occurredAt, sections: data.sections, authorName: therapist.displayName || "" };
        editorPending = { ...await encryptNote(JSON.stringify(payload), dek), kind: data.template, sessionId: data.sessionId || null, parentEntryId: data.parentEntryId, requestId: crypto.randomUUID() };
      }
      memoryDraft = readEditor();
      try { sessionStorage.setItem(draftKey, JSON.stringify(await encryptNote(JSON.stringify(memoryDraft), dek))); } catch { /* saving the actual record still works if browser storage is full */ }
      await api(base + "/prontuario/registros", { method: "POST", body: JSON.stringify(editorPending) });
      draftGeneration++; clearTimeout(draftTimer); removeDraft(); memoryDraft = null; editorDirty = false; editorPending = null; dialog.close();
      activate("entries"); await loadEntries();
    } catch (error) { status($("chartEditorStatus"), "saveError", true); }
    finally { button.disabled = false; entrySaving = false; $("chartEntryForm").inert = false; }
  });
  dialog.addEventListener("keydown", event => { if ((event.ctrlKey || event.metaKey) && event.key === "Enter") { event.preventDefault(); $("chartEntryForm").requestSubmit(); } });
  window.addEventListener("beforeunload", event => { if (profileDirty || patientDirty || editorDirty) { event.preventDefault(); event.returnValue = ""; } });
  document.addEventListener("keydown", event => { if (event.key === "/" && !dialog.open && !/INPUT|TEXTAREA|SELECT/.test(document.activeElement?.tagName || "")) { event.preventDefault(); activate("entries"); $("chartSearch").focus(); } });

  let documentsLoaded = false;
  async function loadDocuments() {
    if (documentsLoaded) return;
    $("chartDocuments").textContent = t("loading");
    try {
      const data = await api("/therapy/documentos?patientId=" + encodeURIComponent(patientId));
      $("chartDocuments").innerHTML = data.documentos.length ? data.documentos.map(doc => `<a class="chart-document-row" href="./documento.html?id=${encodeURIComponent(doc.documentoId)}"><span aria-hidden="true">▤</span><div><strong>${escape(t("document"))} · ${escape(doc.tipo)}</strong><small>${escape(fmt(doc.createdAt))}</small></div><span class="chart-tag">${escape(t(doc.status === "signed" ? "signed" : "documentDraft"))}</span><span aria-hidden="true">↗</span></a>`).join("") : `<p class="chart-empty-copy">${escape(t("noDocuments"))}</p>`;
      documentsLoaded = true;
    } catch { $("chartDocuments").textContent = t("loadError"); }
  }

  $("chartContext").textContent = t("loading"); $("chartCarePlan").textContent = t("loading");
  renderOverview();
  return {
    setPatient(value) {
      patient = value; renderIdentity();
      $("chartPatientForm").querySelectorAll(".chart-card input,.chart-card select,.chart-card textarea").forEach(field => { field.disabled = false; });
      $("chartSavePatient").disabled = false;
      document.querySelectorAll("[data-new-entry]").forEach(button => { button.disabled = false; });
    },
    setSessions(value) { sessions = value; sessionLoaded = true; renderOverview(); },
    load() { return Promise.allSettled([loadProfile(), loadEntries()]); },
    async exportData() {
      const [savedProfile, savedPatient, savedDocuments] = await Promise.all([api(base + "/prontuario"), api(base), api("/therapy/documentos?patientId=" + encodeURIComponent(patientId))]);
      const savedClinical = savedProfile.exists ? JSON.parse(await decryptNote(savedProfile, dek)) : {};
      const persistedPatient = JSON.parse(await decryptNote(savedPatient.patient, dek));
      const documents = await Promise.all(savedDocuments.documentos.map(async document => ({ ...document,
        form: JSON.parse(await decryptNote({ ciphertext: document.formCiphertext, iv: document.formIv }, dek))
      })));
      await loadEntries();
      while (nextCursor) await loadEntries(true);
      return { clinical: savedClinical, entries, documents, patient: { ...patient, ...persistedPatient } };
    },
    activate
  };
}
