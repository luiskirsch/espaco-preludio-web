import test from "node:test";
import assert from "node:assert/strict";

const DEK = new Uint8Array(32).fill(7);
const store = new Map([["ep_dek_b64", Buffer.from(DEK).toString("base64")]]);
globalThis.sessionStorage = {
  getItem: (key) => store.get(key) ?? null,
  setItem: (key, value) => store.set(key, String(value)),
  removeItem: (key) => store.delete(key),
};

const { SessionAiCapture } = await import("../js/session-ai-capture.js");

function memoryStorage() {
  const rows = [];
  return {
    rows,
    put: async (record) => { rows.push(record); },
    list: async (sessionId) => rows.filter((row) => row.sessionId === sessionId),
    deleteSession: async (sessionId) => {
      for (let i = rows.length - 1; i >= 0; i--) if (rows[i].sessionId === sessionId) rows.splice(i, 1);
    },
    prune: async (before) => {
      for (let i = rows.length - 1; i >= 0; i--) if (rows[i].createdAt <= before) rows.splice(i, 1);
    },
  };
}

// Simula uma entrada na sala: grava `parts` como trechos do MediaRecorder.
async function enterRoom({ storage = null, parts = ["audio"], segmentId = Date.now() } = {}) {
  const capture = new SessionAiCapture({
    room: { off() {} },
    sessionId: "sess_teste",
    backendBaseUrl: "https://backend.test",
    idTokenGetter: async () => "token",
    dek: DEK,
    storage,
  });
  await capture._prepareStorage();
  capture.recorder = { mimeType: "audio/webm", state: "recording", stop() { this.state = "inactive"; this.onstop?.(); } };
  capture.audioContext = { close() {} };
  capture.segmentId = segmentId;
  capture.startedAt = Date.now() - 60_000;
  parts.forEach((part, seq) => {
    const blob = new Blob([part], { type: "audio/webm" });
    capture.chunks.push(blob);
    capture._persist(blob, seq);
  });
  await capture.persistChain;
  capture._state = "recording";
  return capture;
}

async function withFetch(responses, run) {
  const calls = [];
  const originalFetch = globalThis.fetch;
  const originalTimeout = globalThis.setTimeout;
  globalThis.setTimeout = (fn) => originalTimeout(fn, 0);
  globalThis.fetch = async (url, init) => {
    calls.push({ url, init, body: await init.body.text() });
    const next = responses[Math.min(calls.length - 1, responses.length - 1)];
    if (next instanceof Error) throw next;
    return new Response(JSON.stringify(next.body), { status: next.status });
  };
  try {
    return { result: await run(), calls };
  } finally {
    globalThis.fetch = originalFetch;
    globalThis.setTimeout = originalTimeout;
  }
}

const ACCEPTED = { status: 202, body: { ok: true, status: "processing" } };

test("recarregar a página não perde o áudio: todas as entradas sobem em ordem", async () => {
  const storage = memoryStorage();
  const first = await enterRoom({ storage, parts: ["inicio-", "da-sessao|"], segmentId: 1000 });
  await first.cancel(); // aba recarregou
  const second = await enterRoom({ storage, parts: ["depois-", "da-recarga"], segmentId: 2000 });

  const { result, calls } = await withFetch([ACCEPTED], () => second.stopAndUpload());
  assert.equal(result.ok, true);
  assert.equal(result.segments, 2);
  assert.equal(calls[0].body, "inicio-da-sessao|depois-da-recarga");
  assert.equal(calls[0].init.headers["X-AI-Segments"], "17,17");
  assert.equal(storage.rows.length, 0, "trechos apagados do aparelho após o envio");
});

test("áudio guardado no aparelho fica cifrado", async () => {
  const storage = memoryStorage();
  await enterRoom({ storage, parts: ["fala sensivel"] });
  assert.equal(storage.rows.length, 1);
  const stored = Buffer.from(storage.rows[0].data).toString("utf8");
  assert.ok(!stored.includes("fala sensivel"));
  assert.equal(storage.rows[0].iv.length, 12);
});

test("falha no envio mantém os trechos guardados para nova tentativa", async () => {
  const storage = memoryStorage();
  const capture = await enterRoom({ storage, parts: ["a", "b"] });
  const { result } = await withFetch([new TypeError("Failed to fetch")], () => capture.stopAndUpload());
  assert.deepEqual(result, { ok: false, error: "Failed to fetch" });
  assert.equal(storage.rows.length, 2);
});

test("envio do áudio tenta de novo após falha de rede e manda os headers cifrados", async () => {
  const capture = await enterRoom();
  const { result, calls } = await withFetch(
    [new TypeError("Failed to fetch"), new TypeError("Failed to fetch"), ACCEPTED],
    () => capture.stopAndUpload()
  );
  assert.equal(result.ok, true);
  assert.equal(calls.length, 3);
  assert.equal(calls[0].url, "https://backend.test/therapy/session/sess_teste/ai-summarize");
  for (const header of ["X-AI-Result-Key", "X-AI-Wrapped-Key", "X-AI-Wrapped-Key-IV", "X-AI-Segments"]) {
    assert.ok(calls[2].init.headers[header], header);
  }
  assert.equal(capture.state(), "done");
});

test("falha de rede persistente devolve erro em vez de sumir", async () => {
  const capture = await enterRoom();
  const { result, calls } = await withFetch([new TypeError("Failed to fetch")], () => capture.stopAndUpload());
  assert.deepEqual(result, { ok: false, error: "Failed to fetch" });
  assert.equal(calls.length, 3);
  assert.equal(capture.state(), "error");
});

test("erro 4xx do servidor não é repetido", async () => {
  const capture = await enterRoom();
  const { result, calls } = await withFetch([{ status: 403, body: { ok: false, error: "CONSENTIMENTO_AUSENTE" } }], () => capture.stopAndUpload());
  assert.equal(calls.length, 1);
  assert.equal(result.ok, false);
  assert.equal(result.error, "CONSENTIMENTO_AUSENTE");
});

test("trechos de sessões abandonadas expiram", async () => {
  const storage = memoryStorage();
  storage.rows.push({ sessionId: "antiga", segmentId: 1, seq: 0, createdAt: Date.now() - 4 * 24 * 60 * 60 * 1000 });
  await enterRoom({ storage, parts: ["x"] });
  assert.deepEqual(storage.rows.map((row) => row.sessionId), ["sess_teste"]);
});
