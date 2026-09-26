import {
  browserSessionPersistence,
  onAuthStateChanged,
  setPersistence,
  signOut
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";
import { auth, BACKEND_BASE_URL } from "./firebase-config.js";

const loading = document.getElementById("dashboardLoading");
const app = document.getElementById("dashboardApp");
const programSelect = document.getElementById("programSelect");
const refreshButton = document.getElementById("refreshDashboard");
const logoutButton = document.getElementById("logoutInstitution");

let overview = null;
let currentProgramId = "";
let currentUser = null;

const STATUS_LABELS = {
  active: "Em operação",
  draft: "Em preparação",
  suspended: "Suspenso",
  closed: "Encerrado",
  inactive: "Inativa"
};

function authReady() {
  return new Promise(resolve => {
    const unsubscribe = onAuthStateChanged(auth, user => {
      unsubscribe();
      resolve(user || null);
    });
  });
}

function formatIsoDate(value) {
  const match = String(value || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return "—";
  return `${match[3]}/${match[2]}/${match[1]}`;
}

function formatDateTime(value) {
  const time = Number(value);
  if (!Number.isFinite(time) || time <= 0) return "—";
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: "America/Sao_Paulo"
  }).format(new Date(time));
}

function formatInteger(value) {
  return new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 0 }).format(Number(value) || 0);
}

function formatProtectedMetric(value) {
  return value === null || value === undefined ? "—" : formatInteger(value);
}

function setText(id, value) {
  const element = document.getElementById(id);
  if (element) element.textContent = value;
}

function createCell(label, text, className = "") {
  const cell = document.createElement("td");
  cell.dataset.label = label;
  cell.textContent = text;
  if (className) cell.className = className;
  return cell;
}

function renderUnits(units = []) {
  const body = document.getElementById("unitsTableBody");
  const empty = document.getElementById("emptyUnits");
  body.replaceChildren();
  empty.hidden = units.length > 0;

  for (const unit of units) {
    const metrics = unit.metrics || {};
    const row = document.createElement("tr");

    const nameCell = document.createElement("td");
    const name = document.createElement("div");
    name.className = "unit-name";
    const strong = document.createElement("strong");
    strong.textContent = unit.name || "Unidade";
    const meta = document.createElement("small");
    meta.className = `unit-status${unit.status === "active" ? "" : " is-inactive"}`;
    const place = [unit.city, unit.state].filter(Boolean).join("/");
    meta.textContent = `${STATUS_LABELS[unit.status] || unit.status || "Situação não informada"}${place ? ` · ${place}` : ""}`;
    name.append(strong, meta);
    nameCell.append(name);
    row.append(nameCell);

    row.append(
      createCell("Participantes", formatInteger(metrics.students), "numeric-cell"),
      createCell("Em cuidado", formatProtectedMetric(metrics.activeCare), "numeric-cell"),
      createCell("Em fluxo", formatProtectedMetric(metrics.pending), "numeric-cell"),
      createCell("Realizadas", formatProtectedMetric(metrics.completedSessions), "numeric-cell"),
      createCell("Agendadas", formatProtectedMetric(metrics.scheduledSessions), "numeric-cell")
    );
    body.append(row);
  }
}

function renderProgram(program) {
  const totals = program.totals || {};
  const units = Array.isArray(program.units) ? program.units : [];
  const place = [program.municipality, program.state].filter(Boolean).join("/");
  const context = [program.contractingAuthorityName, place, program.contractNumber ? `Contrato ${program.contractNumber}` : ""]
    .filter(Boolean).join(" · ");

  setText("programName", program.name || "Programa institucional");
  setText("programContext", context || "Acompanhamento consolidado da operação.");
  setText("programStatus", STATUS_LABELS[program.status] || program.status || "—");
  setText("programPeriod", program.startDate || program.endDate
    ? `${formatIsoDate(program.startDate)} a ${formatIsoDate(program.endDate)}`
    : "—");
  setText("programCapacity", program.maxStudents
    ? `${formatInteger(totals.students)} de ${formatInteger(program.maxStudents)} estudantes`
    : `${formatInteger(totals.students)} participantes`);
  setText("scheduledSessions", totals.scheduledSessions == null
    ? "Amostra protegida"
    : `${formatInteger(totals.scheduledSessions)} ${totals.scheduledSessions === 1 ? "atendimento" : "atendimentos"}`);
  setText("metricUnits", formatInteger(totals.activeSchools));
  setText("metricUnitsNote", `de ${formatInteger(totals.schools)} ${totals.schools === 1 ? "unidade" : "unidades"}`);
  setText("metricStudents", formatInteger(totals.students));
  setText("metricStudentsNote", program.maxStudents
    ? `${Math.min(100, Math.round((Number(totals.students || 0) / Number(program.maxStudents)) * 100))}% da capacidade`
    : "no programa");
  setText("metricSessions", formatProtectedMetric(totals.completedSessions));
  setText("metricSessionsNote", totals.protectedByThreshold ? "amostra protegida" : "acumulado do programa");
  setText("metricCare", formatProtectedMetric(totals.activeCare));
  setText("metricCareNote", totals.protectedByThreshold
    ? "amostra protegida"
    : `${formatInteger(totals.pending)} ${totals.pending === 1 ? "solicitação" : "solicitações"} em fluxo`);
  renderUnits(units);
}

function renderOverview(data) {
  overview = data;
  const programs = Array.isArray(data.programs) ? data.programs : [];
  if (!programs.length) throw new Error("SEM_PROGRAMAS_AUTORIZADOS");

  setText("actorName", data.actor?.name || "Gestão institucional");
  setText("actorEmail", data.actor?.email || currentUser?.email || "");

  const preservedId = programs.some(program => program.id === currentProgramId)
    ? currentProgramId
    : programs[0].id;
  currentProgramId = preservedId;
  programSelect.replaceChildren(...programs.map(program => {
    const option = document.createElement("option");
    option.value = program.id;
    option.textContent = program.name || "Programa institucional";
    return option;
  }));
  programSelect.value = currentProgramId;
  programSelect.disabled = programs.length === 1;
  renderProgram(programs.find(program => program.id === currentProgramId) || programs[0]);
  setText("lastUpdate", `Atualizado em ${formatDateTime(data.updatedAt || Date.now())}`);
}

async function requestOverview(forceRefresh = false) {
  let token = await currentUser.getIdToken(forceRefresh);
  let response = await fetch(`${BACKEND_BASE_URL}/institution/overview`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store"
  });

  if (response.status === 401 && !forceRefresh) {
    token = await currentUser.getIdToken(true);
    response = await fetch(`${BACKEND_BASE_URL}/institution/overview`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store"
    });
  }

  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data.ok) {
    const error = new Error(data?.error || `HTTP_${response.status}`);
    error.code = data?.error || `HTTP_${response.status}`;
    error.status = response.status;
    throw error;
  }
  return data;
}

function showFatal(text) {
  loading.classList.add("is-error");
  loading.replaceChildren();
  const title = document.createElement("strong");
  title.textContent = "Não foi possível carregar o painel";
  const detail = document.createElement("span");
  detail.textContent = text;
  const retry = document.createElement("button");
  retry.type = "button";
  retry.textContent = "Tentar novamente";
  retry.addEventListener("click", () => location.reload());
  loading.append(title, detail, retry);
}

function humanize(error) {
  const code = String(error?.code || error?.message || "");
  if (code.includes("Failed to fetch") || code.includes("auth/network-request-failed")) {
    return "Verifique sua conexão com a internet e tente novamente.";
  }
  if (code.includes("SEM_PROGRAMAS_AUTORIZADOS")) {
    return "Nenhum programa ou unidade está disponível para esta conta.";
  }
  return "Os indicadores estão temporariamente indisponíveis. Tente novamente em instantes.";
}

async function loadDashboard(forceRefresh = false) {
  refreshButton.classList.add("is-loading");
  refreshButton.disabled = true;
  try {
    const data = await requestOverview(forceRefresh);
    renderOverview(data);
    loading.hidden = true;
    app.hidden = false;
  } finally {
    refreshButton.classList.remove("is-loading");
    refreshButton.disabled = false;
  }
}

programSelect.addEventListener("change", () => {
  currentProgramId = programSelect.value;
  const program = overview?.programs?.find(item => item.id === currentProgramId);
  if (program) renderProgram(program);
});

refreshButton.addEventListener("click", () => {
  loadDashboard(true).catch(error => showFatal(humanize(error)));
});

logoutButton.addEventListener("click", async () => {
  logoutButton.disabled = true;
  await signOut(auth).catch(() => {});
  window.location.replace("./instituicao-login.html");
});

(async () => {
  try {
    await setPersistence(auth, browserSessionPersistence);
    currentUser = await authReady();
    if (!currentUser) {
      window.location.replace("./instituicao-login.html?erro=sessao");
      return;
    }
    await loadDashboard();
  } catch (error) {
    const code = String(error?.code || error?.message || "");
    if (error?.status === 401) {
      await signOut(auth).catch(() => {});
      window.location.replace("./instituicao-login.html?erro=sessao");
      return;
    }
    if (error?.status === 403 || code.includes("ACESSO_INSTITUCIONAL_NAO_LIBERADO")) {
      await signOut(auth).catch(() => {});
      window.location.replace("./instituicao-login.html?erro=acesso");
      return;
    }
    showFatal(humanize(error));
  }
})();
