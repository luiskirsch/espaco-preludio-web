// Agendamento pela Aurora — parte do navegador.
//
// A Aurora (backend) só propõe: { paciente, data, hora, ... }. O cadastro de
// pacientes é cifrado com a DEK do profissional, então achar "luis henrique"
// e o e-mail dele só é possível aqui. A consulta é criada pela mesma rota do
// modal "Nova consulta", e só depois do clique em Confirmar no cartão.

import { decryptNote, recallDek } from "./crypto.js";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function normalizeName(value) {
  return String(value || "")
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .toLowerCase().replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ").trim();
}

export function isValidEmail(value) {
  return EMAIL_RE.test(String(value || "").trim());
}

// Nome exato primeiro; depois nomes que contenham todas as palavras pedidas
// (como início de palavra): "luis henrique" acha "Luis Henrique Kirsch".
export function matchPatients(query, entries) {
  const q = normalizeName(query);
  if (!q) return [];
  const queryTokens = q.split(" ");
  return entries
    .map(entry => {
      const name = normalizeName(entry.name);
      if (!name) return null;
      if (name === q) return { ...entry, score: 2 };
      const tokens = name.split(" ");
      return queryTokens.every(t => tokens.some(token => token.startsWith(t))) ? { ...entry, score: 1 } : null;
    })
    .filter(Boolean)
    .sort((a, b) =>
      b.score - a.score ||
      (a.source === b.source ? 0 : a.source === "cadastro" ? -1 : 1) ||
      a.name.localeCompare(b.name, "pt-BR"));
}

// Pacientes cadastrados (decifrados com a DEK) + nomes que só aparecem em
// consultas anteriores. E-mail: contato do cadastro, senão o último usado
// numa consulta daquele paciente.
export async function loadBookingDirectory({ backendBaseUrl, getToken, dek = recallDek(), fetchImpl = fetch }) {
  const token = await getToken();
  const headers = { Authorization: `Bearer ${token}` };
  const [patientsRes, sessionsRes] = await Promise.all([
    fetchImpl(`${backendBaseUrl}/therapy/pacientes`, { headers }),
    fetchImpl(`${backendBaseUrl}/therapy/sessoes?includeHidden=true`, { headers })
  ]);
  const patientsData = await patientsRes.json().catch(() => ({}));
  const sessionsData = await sessionsRes.json().catch(() => ({}));
  const sessions = Array.isArray(sessionsData.sessions) ? sessionsData.sessions.filter(s => !s.syntheticData) : [];

  const lastEmailById = new Map();
  const lastEmailByName = new Map();
  [...sessions]
    .filter(s => isValidEmail(s.patientEmail))
    .sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0))
    .forEach(s => {
      if (s.patientId) lastEmailById.set(s.patientId, s.patientEmail);
      lastEmailByName.set(normalizeName(s.patientName), s.patientEmail);
    });

  const registered = [];
  if (dek && patientsRes.ok && Array.isArray(patientsData.patients)) {
    for (const p of patientsData.patients) {
      try {
        const record = JSON.parse(await decryptNote({ ciphertext: p.ciphertext, iv: p.iv }, dek));
        const name = String(record.name || "").trim();
        if (!name) continue;
        const contact = String(record.contact || "").trim().toLowerCase();
        registered.push({
          key: `id:${p.patientId}`,
          source: "cadastro",
          patientId: p.patientId,
          name,
          email: isValidEmail(contact) ? contact : (lastEmailById.get(p.patientId) || lastEmailByName.get(normalizeName(name)) || "")
        });
      } catch { /* registro ilegível: ignora */ }
    }
  }

  const registeredNames = new Set(registered.map(r => normalizeName(r.name)));
  const fromSessions = new Map();
  for (const s of sessions) {
    const key = normalizeName(s.patientName);
    if (!key || registeredNames.has(key) || fromSessions.has(key)) continue;
    fromSessions.set(key, {
      key: `name:${key}`,
      source: "consulta anterior",
      patientId: null,
      name: String(s.patientName).trim(),
      email: lastEmailByName.get(key) || ""
    });
  }

  return { entries: [...registered, ...fromSessions.values()], hasDek: !!dek };
}

// Data/hora da proposta no horário local do navegador — mesmo cálculo do
// modal "Nova consulta".
export function proposalTimestamp(proposal) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(proposal?.data || "") || !/^\d{2}:\d{2}$/.test(proposal?.hora || "")) return NaN;
  return new Date(`${proposal.data}T${proposal.hora}`).getTime();
}

export async function createSessionFromProposal({ backendBaseUrl, getToken, proposal, patient, email, now = Date.now(), fetchImpl = fetch }) {
  const scheduledAt = proposalTimestamp(proposal);
  if (!Number.isFinite(scheduledAt)) return { ok: false, error: "DATA_INVALIDA" };
  if (scheduledAt < now - 5 * 60 * 1000) return { ok: false, error: "HORARIO_PASSADO" };
  if (!patient?.name) return { ok: false, error: "PACIENTE_OBRIGATORIO" };
  const patientEmail = String(email || "").trim().toLowerCase();
  if (!isValidEmail(patientEmail)) return { ok: false, error: "EMAIL_INVALIDO" };

  const res = await fetchImpl(`${backendBaseUrl}/therapy/sessao/criar`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${await getToken()}` },
    body: JSON.stringify({
      patientName: patient.name,
      patientId: patient.patientId || undefined,
      patientEmail,
      scheduledAt
    })
  });
  const data = await res.json().catch(() => ({}));
  if (res.status === 402) return { ok: false, error: "PLANO_INATIVO" };
  if (!res.ok || !data.ok) return { ok: false, error: data?.error || `HTTP_${res.status}` };
  return { ok: true, sessionId: data.session?.sessionId || null, scheduledAt };
}

// Proposta vinda da API → só os campos esperados, com limites.
export function sanitizeProposal(action) {
  if (action?.type !== "agendar_consulta") return null;
  const text = (value, max) => String(value || "").slice(0, max);
  const proposal = {
    type: "agendar_consulta",
    paciente: text(action.paciente, 80),
    data: text(action.data, 10),
    hora: text(action.hora, 5),
    duracaoMin: Math.max(0, Math.min(600, Number(action.duracaoMin) || 0)),
    quando: text(action.quando, 40),
    conflitos: (Array.isArray(action.conflitos) ? action.conflitos : []).slice(0, 5)
      .map(c => ({ quando: text(c?.quando, 40), paciente: text(c?.paciente, 60) }))
  };
  return proposal.paciente && Number.isFinite(proposalTimestamp(proposal)) ? proposal : null;
}
