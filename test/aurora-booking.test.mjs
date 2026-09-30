import test from "node:test";
import assert from "node:assert/strict";

globalThis.sessionStorage = { getItem: () => null, setItem() {}, removeItem() {} };

const { encryptNote } = await import("../js/crypto.js");
const {
  normalizeName, matchPatients, loadBookingDirectory, createSessionFromProposal, sanitizeProposal, proposalTimestamp
} = await import("../js/aurora-booking.js");

const DEK = new Uint8Array(32).fill(3);
const entries = [
  { key: "id:1", source: "cadastro", patientId: "1", name: "Luís Henrique Kirsch", email: "luis@x.com" },
  { key: "id:2", source: "cadastro", patientId: "2", name: "Luis Henrique", email: "" },
  { key: "id:3", source: "cadastro", patientId: "3", name: "Henrique Luz", email: "" },
  { key: "name:carla", source: "consulta anterior", patientId: null, name: "Carla", email: "carla@x.com" }
];

test("normaliza acentos, caixa e espaços", () => {
  assert.equal(normalizeName("  Luís   HENRIQUE! "), "luis henrique");
});

test("encontra o paciente pelo nome falado, exato primeiro", () => {
  assert.deepEqual(matchPatients("luis henrique", entries).map(e => e.name), ["Luis Henrique", "Luís Henrique Kirsch"]);
  // Ordem das palavras não importa ("Kirsch Luis"); nomes ambíguos viram escolha no cartão.
  assert.deepEqual(matchPatients("kirsch luis", entries).map(e => e.name), ["Luís Henrique Kirsch"]);
  assert.deepEqual(matchPatients("lu hen", entries).map(e => e.name), ["Henrique Luz", "Luis Henrique", "Luís Henrique Kirsch"]);
  assert.deepEqual(matchPatients("carla", entries).map(e => e.source), ["consulta anterior"]);
  assert.deepEqual(matchPatients("maria", entries), []);
  assert.deepEqual(matchPatients("", entries), []);
});

test("monta a lista a partir do cadastro cifrado e das consultas anteriores", async () => {
  const enc = async obj => encryptNote(JSON.stringify(obj), DEK);
  const patients = [
    { patientId: "p1", ...(await enc({ name: "Luís Henrique Kirsch", contact: "Luis@Exemplo.com" })) },
    { patientId: "p2", ...(await enc({ name: "Ana Souza", contact: "(48) 99999-0000" })) },
    { patientId: "p3", ciphertext: "corrompido", iv: "x" }
  ];
  const sessions = [
    { patientId: "p2", patientName: "Ana Souza", patientEmail: "ana.antigo@x.com", createdAt: 1 },
    { patientId: "p2", patientName: "Ana Souza", patientEmail: "ana@x.com", createdAt: 2 },
    { patientId: null, patientName: "Carla Dias", patientEmail: "carla@x.com", createdAt: 3 },
    { patientId: null, patientName: "Demo", patientEmail: "demo@x.com", createdAt: 4, syntheticData: true }
  ];
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url, auth: init.headers.Authorization });
    const body = url.includes("/therapy/pacientes") ? { ok: true, patients } : { ok: true, sessions };
    return { ok: true, json: async () => body };
  };
  const dir = await loadBookingDirectory({ backendBaseUrl: "https://api.test", getToken: async () => "tok", dek: DEK, fetchImpl });
  assert.equal(dir.hasDek, true);
  assert.deepEqual(dir.entries.map(e => [e.name, e.source, e.email]), [
    ["Luís Henrique Kirsch", "cadastro", "luis@exemplo.com"],
    ["Ana Souza", "cadastro", "ana@x.com"],
    ["Carla Dias", "consulta anterior", "carla@x.com"]
  ]);
  assert.ok(calls.every(c => c.auth === "Bearer tok"));
  assert.ok(calls.some(c => c.url.endsWith("/therapy/sessoes?includeHidden=true")));
});

test("sem a chave da conta, usa só pacientes de consultas anteriores", async () => {
  const fetchImpl = async url => ({ ok: true, json: async () => (url.includes("pacientes") ? { ok: true, patients: [{ patientId: "p1", ciphertext: "x", iv: "y" }] } : { ok: true, sessions: [{ patientName: "Carla", patientEmail: "c@x.com" }] }) });
  const dir = await loadBookingDirectory({ backendBaseUrl: "https://api.test", getToken: async () => "tok", dek: null, fetchImpl });
  assert.equal(dir.hasDek, false);
  assert.deepEqual(dir.entries.map(e => e.name), ["Carla"]);
});

test("cria a consulta com os mesmos campos do modal Nova consulta", async () => {
  const proposal = { data: "2030-05-10", hora: "12:00" };
  let request;
  const fetchImpl = async (url, init) => { request = { url, ...init, body: JSON.parse(init.body) }; return { ok: true, status: 200, json: async () => ({ ok: true, session: { sessionId: "sess_1", joinCode: "ABC23456", joinToken: "token-longo" } }) }; };
  const result = await createSessionFromProposal({
    backendBaseUrl: "https://api.test", getToken: async () => "tok", proposal,
    patient: { name: "Luís Henrique Kirsch", patientId: "p1" }, email: " LUIS@x.com ", fetchImpl
  });
  assert.equal(result.ok, true);
  assert.equal(result.sessionId, "sess_1");
  assert.equal(result.joinCodeOrToken, "ABC23456", "prefere o código curto para montar o link do paciente");
  assert.equal(request.url, "https://api.test/therapy/sessao/criar");
  assert.equal(request.method, "POST");
  assert.deepEqual(request.body, { patientName: "Luís Henrique Kirsch", patientId: "p1", patientEmail: "luis@x.com", scheduledAt: new Date("2030-05-10T12:00").getTime() });
});

test("barra horário passado, e-mail inválido e plano inativo", async () => {
  const ok = async () => ({ ok: true, status: 200, json: async () => ({ ok: true }) });
  const base = { backendBaseUrl: "https://api.test", getToken: async () => "tok", patient: { name: "Ana" }, fetchImpl: ok };
  assert.equal((await createSessionFromProposal({ ...base, proposal: { data: "2020-01-01", hora: "10:00" }, email: "a@x.com" })).error, "HORARIO_PASSADO");
  assert.equal((await createSessionFromProposal({ ...base, proposal: { data: "2030-01-01", hora: "10:00" }, email: "sem-arroba" })).error, "EMAIL_INVALIDO");
  const plan = async () => ({ ok: false, status: 402, json: async () => ({ ok: false, error: "TRIAL_EXPIRADO" }) });
  assert.equal((await createSessionFromProposal({ ...base, fetchImpl: plan, proposal: { data: "2030-01-01", hora: "10:00" }, email: "a@x.com" })).error, "PLANO_INATIVO");
});

test("proposta da API é filtrada e limitada", () => {
  const clean = sanitizeProposal({ type: "agendar_consulta", paciente: "Ana", data: "2030-01-01", hora: "10:00", duracaoMin: 50, quando: "ter., 01/01, 10:00", conflitos: [{ quando: "x", paciente: "y", extra: "z" }], extra: "<script>" });
  assert.deepEqual(clean, { type: "agendar_consulta", paciente: "Ana", data: "2030-01-01", hora: "10:00", duracaoMin: 50, quando: "ter., 01/01, 10:00", conflitos: [{ quando: "x", paciente: "y" }] });
  assert.equal(sanitizeProposal({ type: "outra_coisa" }), null);
  assert.equal(sanitizeProposal({ type: "agendar_consulta", paciente: "Ana", data: "amanhã", hora: "10h" }), null);
  assert.ok(Number.isNaN(proposalTimestamp({ data: "2030-01-01", hora: "10h" })));
});
