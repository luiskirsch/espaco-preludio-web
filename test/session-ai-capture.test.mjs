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
const { createAiSummaryEnvelope, deriveAiSessionKey } = await import("../js/ai-summary-crypto.js");
const { unwrapKey } = await import("../js/crypto.js");

function memoryStorage() {
  const rows = [];
  const keyOf = (row) => row.pieceKey || String(row.segmentId);
  return {
    rows,
    put: async (record) => { rows.push(record); },
    list: async (sessionId) => rows.filter((row) => row.sessionId === sessionId),
    deletePiece: async (sessionId, pieceKey) => {
      for (let i = rows.length - 1; i >= 0; i--) if (rows[i].sessionId === sessionId && keyOf(rows[i]) === pieceKey) rows.splice(i, 1);
    },
    deleteSession: async (sessionId) => {
      for (let i = rows.length - 1; i >= 0; i--) if (rows[i].sessionId === sessionId) rows.splice(i, 1);
    },
    prune: async (before) => {
      for (let i = rows.length - 1; i >= 0; i--) if (rows[i].createdAt <= before) rows.splice(i, 1);
    },
  };
}

// Captura pronta para gravar, sem MediaRecorder: os testes montam os pedaços.
async function newCapture(storage = null) {
  const capture = new SessionAiCapture({
    room: { off() {} },
    sessionId: "sess_teste",
    backendBaseUrl: "https://backend.test",
    idTokenGetter: async () => "token",
    dek: DEK,
    storage,
  });
  await capture._prepareStorage();
  capture.audioContext = { close() {} };
  capture.startedAt = Date.now() - 60_000;
  capture._state = "recording";
  return capture;
}

// Grava `parts` num pedaço novo. `close` simula o fechamento após 90 s.
async function recordPiece(capture, parts, { close = true } = {}) {
  const piece = capture._newPiece();
  for (const part of parts) capture._addChunk(piece, new Blob([part], { type: "audio/webm" }));
  await capture.persistChain;
  if (close) await capture._closePiece(piece);
  else capture.current = piece;
  return piece;
}

async function withFetch(responder, run) {
  const calls = [];
  const originalFetch = globalThis.fetch;
  const originalTimeout = globalThis.setTimeout;
  globalThis.setTimeout = (fn) => originalTimeout(fn, 0);
  globalThis.fetch = async (url, init) => {
    const call = { url, init, body: await init.body.text() };
    calls.push(call);
    const next = typeof responder === "function" ? responder(call, calls.length) : responder[Math.min(calls.length - 1, responder.length - 1)];
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

const OK = { status: 200, body: { ok: true } };
const ACCEPTED = { status: 202, body: { ok: true, status: "processing" } };
const idle = (capture) => capture._pump || Promise.resolve();

test("pedaço fechado sobe em segundo plano e sai do aparelho só depois de confirmado", async () => {
  const storage = memoryStorage();
  const capture = await newCapture(storage);
  const { calls } = await withFetch([OK], async () => {
    const piece = await recordPiece(capture, ["fala-", "um"]);
    await idle(capture);
    return piece;
  });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, "https://backend.test/therapy/session/sess_teste/ai-piece");
  assert.equal(calls[0].body, "fala-um");
  assert.match(calls[0].init.headers["X-AI-Piece-Key"], /^\d{10,16}-[a-z0-9]+$/);
  for (const header of ["X-AI-Result-Key", "X-AI-Wrapped-Key", "X-AI-Wrapped-Key-IV"]) assert.ok(calls[0].init.headers[header], header);
  assert.equal(storage.rows.length, 0, "pedaço confirmado apagado do aparelho");
});

test("servidor ocupado: o pedaço fica guardado e é reenviado até confirmar", async () => {
  const storage = memoryStorage();
  const capture = await newCapture(storage);
  const { calls } = await withFetch(
    (call, n) => (n < 3 ? { status: 503, body: { ok: false, error: "AI_PIECE_OCUPADO", retryAfterSec: 45 } } : OK),
    async () => { await recordPiece(capture, ["a"]); await idle(capture); }
  );
  assert.equal(calls.length, 3);
  assert.equal(new Set(calls.map((c) => c.init.headers["X-AI-Piece-Key"])).size, 1, "mesma chave em todas as tentativas");
  assert.equal(storage.rows.length, 0);
});

test("encerrar manda só os pedaços não confirmados, em ordem, com as chaves", async () => {
  const storage = memoryStorage();
  const capture = await newCapture(storage);
  const { result, calls } = await withFetch(
    (call) => (call.url.endsWith("/ai-piece")
      ? (call.body === "primeiro" ? OK : { status: 503, body: { ok: false } })
      : ACCEPTED),
    async () => {
      await recordPiece(capture, ["primeiro"]);          // confirmado durante a consulta
      await idle(capture);
      await recordPiece(capture, ["segundo"]);           // servidor ocupado
      await recordPiece(capture, ["terceiro"], { close: false }); // pedaço em andamento
      return capture.stopAndUpload();
    }
  );
  assert.equal(result.ok, true);
  assert.equal(result.segments, 2);
  const finalize = calls.find((c) => c.url.endsWith("/ai-summarize"));
  assert.equal(finalize.body, "segundoterceiro");
  assert.equal(finalize.init.headers["X-AI-Segments"], "7,8");
  const keys = finalize.init.headers["X-AI-Piece-Keys"].split(",");
  assert.equal(keys.length, 2);
  assert.ok(Number(keys[0].split("-")[0]) < Number(keys[1].split("-")[0]), "ordem de gravação");
  assert.ok(storage.rows.length > 0, "pendentes ficam no aparelho até o resumo ficar pronto");
  assert.equal(capture.state(), "done");
});

test("tudo confirmado durante a consulta: encerrar manda o pedido vazio", async () => {
  const capture = await newCapture(memoryStorage());
  const { result, calls } = await withFetch(
    (call) => (call.url.endsWith("/ai-piece") ? OK : ACCEPTED),
    async () => {
      await recordPiece(capture, ["unico"]);
      await idle(capture);
      return capture.stopAndUpload();
    }
  );
  assert.equal(result.ok, true);
  const finalize = calls.find((c) => c.url.endsWith("/ai-summarize"));
  assert.equal(finalize.body, "");
  assert.equal(finalize.init.headers["X-AI-Piece-Keys"], "");
  assert.equal(finalize.init.headers["X-AI-Segments"], undefined);
});

test("reentrada na sala: pedaços pendentes da entrada anterior voltam para a fila", async () => {
  const storage = memoryStorage();
  const first = await newCapture(storage);
  await withFetch([new TypeError("Failed to fetch")], async () => {
    await recordPiece(first, ["antes-da-recarga"]);
    await first.cancel(); // aba recarregou
  });
  assert.ok(storage.rows.length > 0);

  const second = await newCapture(storage);
  const { calls } = await withFetch([OK], async () => {
    await second._enqueueLeftovers();
    await idle(second);
  });
  assert.equal(calls[0].body, "antes-da-recarga");
  assert.equal(storage.rows.length, 0);
});

test("gravação da versão anterior (sem chave de pedaço) ainda é enviada", async () => {
  const storage = memoryStorage();
  const capture = await newCapture(storage);
  // Trecho como a versão antiga guardava: só segmentId.
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const data = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, capture.cryptoKey, new TextEncoder().encode("legado"));
  storage.rows.push({ sessionId: "sess_teste", segmentId: 1790000000000, seq: 0, mime: "audio/webm", iv, data, createdAt: Date.now() });
  const { calls } = await withFetch([ACCEPTED], () => capture.stopAndUpload());
  const finalize = calls.find((c) => c.url.endsWith("/ai-summarize"));
  assert.equal(finalize.body, "legado");
  assert.equal(finalize.init.headers["X-AI-Piece-Keys"], "1790000000000");
});

test("áudio guardado no aparelho fica cifrado", async () => {
  const storage = memoryStorage();
  const capture = await newCapture(storage);
  await recordPiece(capture, ["fala sensivel"], { close: false });
  assert.equal(storage.rows.length, 1);
  const stored = Buffer.from(storage.rows[0].data).toString("utf8");
  assert.ok(!stored.includes("fala sensivel"));
  assert.equal(storage.rows[0].iv.length, 12);
});

test("falha de rede persistente no encerramento devolve erro e mantém o áudio", async () => {
  const storage = memoryStorage();
  const capture = await newCapture(storage);
  await recordPiece(capture, ["a", "b"], { close: false });
  const { result, calls } = await withFetch([new TypeError("Failed to fetch")], () => capture.stopAndUpload());
  assert.deepEqual(result, { ok: false, error: "Failed to fetch" });
  assert.equal(calls.filter((c) => c.url.endsWith("/ai-summarize")).length, 3);
  assert.equal(storage.rows.length, 2);
  assert.equal(capture.state(), "error");
});

test("erro 4xx no encerramento não é repetido", async () => {
  const capture = await newCapture();
  await recordPiece(capture, ["x"], { close: false });
  const { result, calls } = await withFetch([{ status: 403, body: { ok: false, error: "CONSENTIMENTO_AUSENTE" } }], () => capture.stopAndUpload());
  assert.equal(calls.length, 1);
  assert.equal(result.ok, false);
  assert.equal(result.error, "CONSENTIMENTO_AUSENTE");
});

test("4xx num pedaço (sem consentimento) para os envios durante a consulta", async () => {
  const capture = await newCapture(memoryStorage());
  const { calls } = await withFetch([{ status: 403, body: { ok: false, error: "CONSENTIMENTO_PACIENTE_AUSENTE" } }], async () => {
    await recordPiece(capture, ["a"]);
    await idle(capture);
    await recordPiece(capture, ["b"]);
    await idle(capture);
  });
  assert.equal(calls.length, 1);
  assert.equal(capture._blocked, "CONSENTIMENTO_PACIENTE_AUSENTE");
});

test("sem nada gravado, encerrar devolve empty_recording", async () => {
  const capture = await newCapture(memoryStorage());
  const { result } = await withFetch([ACCEPTED], () => capture.stopAndUpload());
  assert.deepEqual(result, { ok: false, error: "empty_recording" });
});

test("trechos de sessões abandonadas expiram", async () => {
  const storage = memoryStorage();
  storage.rows.push({ sessionId: "antiga", segmentId: 1, seq: 0, createdAt: Date.now() - 4 * 24 * 60 * 60 * 1000 });
  const capture = await newCapture(storage);
  await recordPiece(capture, ["x"], { close: false });
  assert.deepEqual(storage.rows.map((row) => row.sessionId), ["sess_teste"]);
});

test("chave da sessão é estável (recarga, reentrada) e diferente entre sessões", async () => {
  const a1 = await createAiSummaryEnvelope(DEK, { sessionId: "sess_a" });
  const a2 = await createAiSummaryEnvelope(DEK, { sessionId: "sess_a" });
  const b = await createAiSummaryEnvelope(DEK, { sessionId: "sess_b" });
  assert.equal(a1.headers["X-AI-Result-Key"], a2.headers["X-AI-Result-Key"]);
  assert.notEqual(a1.headers["X-AI-Result-Key"], b.headers["X-AI-Result-Key"]);
  // O embrulho pela DEK devolve a mesma chave — o prontuário abre o resumo como antes.
  const unwrapped = await unwrapKey({ ciphertext: a2.headers["X-AI-Wrapped-Key"], iv: a2.headers["X-AI-Wrapped-Key-IV"] }, DEK);
  assert.deepEqual(Array.from(unwrapped), Array.from(await deriveAiSessionKey(DEK, "sess_a")));
  // Sem sessionId: chave aleatória (modo antigo).
  const r1 = await createAiSummaryEnvelope(DEK);
  const r2 = await createAiSummaryEnvelope(DEK);
  assert.notEqual(r1.headers["X-AI-Result-Key"], r2.headers["X-AI-Result-Key"]);
});
