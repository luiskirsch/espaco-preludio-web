import test from "node:test";
import assert from "node:assert/strict";

const store = new Map([["ep_dek_b64", Buffer.alloc(32, 7).toString("base64")]]);
globalThis.sessionStorage = {
  getItem: (key) => store.get(key) ?? null,
  setItem: (key, value) => store.set(key, String(value)),
  removeItem: (key) => store.delete(key),
};

const { SessionAiCapture } = await import("../js/session-ai-capture.js");

function recordingCapture() {
  const capture = new SessionAiCapture({
    room: { off() {} },
    sessionId: "sess_teste",
    backendBaseUrl: "https://backend.test",
    idTokenGetter: async () => "token",
  });
  capture.recorder = { mimeType: "audio/webm", stop() { this.onstop(); } };
  capture.audioContext = { close() {} };
  capture.chunks = [new Blob(["audio"], { type: "audio/webm" })];
  capture.startedAt = Date.now() - 60_000;
  capture._state = "recording";
  return capture;
}

async function withFetch(responses, run) {
  const calls = [];
  const originalFetch = globalThis.fetch;
  const originalTimeout = globalThis.setTimeout;
  globalThis.setTimeout = (fn) => originalTimeout(fn, 0);
  globalThis.fetch = async (url, init) => {
    calls.push({ url, init });
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

test("envio do áudio tenta de novo após falha de rede e manda os headers cifrados", async () => {
  const capture = recordingCapture();
  const { result, calls } = await withFetch(
    [new TypeError("Failed to fetch"), new TypeError("Failed to fetch"), { status: 202, body: { ok: true, status: "processing" } }],
    () => capture.stopAndUpload()
  );
  assert.equal(result.ok, true);
  assert.equal(calls.length, 3);
  assert.equal(calls[0].url, "https://backend.test/therapy/session/sess_teste/ai-summarize");
  for (const header of ["X-AI-Result-Key", "X-AI-Wrapped-Key", "X-AI-Wrapped-Key-IV"]) {
    assert.ok(calls[2].init.headers[header], header);
  }
  assert.equal(capture.state(), "done");
});

test("falha de rede persistente devolve erro em vez de sumir", async () => {
  const capture = recordingCapture();
  const { result, calls } = await withFetch([new TypeError("Failed to fetch")], () => capture.stopAndUpload());
  assert.deepEqual(result, { ok: false, error: "Failed to fetch" });
  assert.equal(calls.length, 3);
  assert.equal(capture.state(), "error");
});

test("erro 4xx do servidor não é repetido", async () => {
  const capture = recordingCapture();
  const { result, calls } = await withFetch([{ status: 403, body: { ok: false, error: "CONSENTIMENTO_AUSENTE" } }], () => capture.stopAndUpload());
  assert.equal(calls.length, 1);
  assert.equal(result.ok, false);
  assert.equal(result.error, "CONSENTIMENTO_AUSENTE");
});
