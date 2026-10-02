// Espaço Prelúdio — captura de áudio mixado (local + remote) pra resumo IA.
//
// Distinto do session-record.js (gravação cifrada local pro arquivo do
// terapeuta). Aqui:
//   - Capturamos APENAS áudio (não vídeo) — Whisper só usa áudio
//   - Mixamos LocalAudioTrack + RemoteAudioTrack via Web Audio API
//   - Gravamos com MediaRecorder em webm/opus mono (voz; ~11 MB por hora)
//
// Transcrição progressiva: a gravação é cortada em PEDAÇOS de ~90 s (um
// MediaRecorder novo por pedaço, então cada um é um WebM completo). Cada
// pedaço fechado é enviado em segundo plano para /ai-piece, que transcreve na
// hora e guarda só o texto cifrado. Ao encerrar, só os pedaços ainda não
// confirmados vão junto com o pedido de resumo — o resumo fica pronto em
// minutos em vez de ~metade da duração da sessão.
//
// Nada se perde: cada trecho de 2 s fica no IndexedDB desta máquina cifrado
// com a DEK do profissional até o servidor CONFIRMAR o pedaço. Recarga,
// reentrada na sala, queda de rede ou reinício do servidor só atrasam o envio.
// Sobras de sessões abandonadas expiram em 3 dias.

import { recallDek } from "./crypto.js";
// Versionado: uma cópia antiga em cache ignoraria a chave por sessão.
import { createAiSummaryEnvelope } from "./ai-summary-crypto.js?v=2";

// Numa recarga, o que ainda não virou trecho se perde (a gravação no
// IndexedDB durante o unload não termina a tempo): 2 s é o teto dessa perda.
const TIMESLICE_MS = 2000;
const PIECE_MS = 90_000;
const TRACK_RESCAN_MS = 3000;
const AUDIO_BITS_PER_SECOND = 24_000;
const PENDING_TTL_MS = 3 * 24 * 60 * 60 * 1000;
// Espera entre tentativas de um pedaço que falhou (servidor ocupado, rede).
const RETRY_DELAYS_MS = [5_000, 15_000, 45_000, 60_000];
// Ao encerrar, espera o envio em andamento por até este tempo; se não
// terminar, o pedaço vai junto no pedido de resumo (o servidor deduplica).
const STOP_WAIT_INFLIGHT_MS = 3_000;

const PIECE_KEY_RE = /^\d{10,16}(?:-[a-z0-9]{1,16})?$/;
// Registros da versão anterior (sem pieceKey): o segmento inteiro vira um pedaço.
const keyOfRecord = (record) => record.pieceKey || String(record.segmentId);
const randomSuffix = () => Array.from(crypto.getRandomValues(new Uint8Array(4)), (b) => b.toString(36).padStart(2, "0")).join("").slice(0, 8);

export class SessionAiCapture {
  constructor({ room, sessionId, backendBaseUrl, idTokenGetter, onStateChange, dek, storage, pieceMs = PIECE_MS }) {
    this.pieceMs = pieceMs;
    this.room = room;
    this.sessionId = sessionId;
    this.backendBaseUrl = String(backendBaseUrl || "").replace(/\/+$/, "");
    this.idTokenGetter = idTokenGetter || (() => null);
    this.onStateChange = onStateChange || (() => {});
    this.dek = dek || null;
    this.storage = storage === undefined ? createIndexedDbStorage() : storage;
    this.cryptoKey = null;
    this.audioContext = null;
    this.destination = null;
    this.mimeType = "audio/webm";
    this.recorder = null;          // MediaRecorder do pedaço atual
    this.current = null;           // pedaço atual
    this.pieces = new Map();       // key → { key, segmentId, chunks, seq, recorder, stopped }
    this.uploadQueue = [];         // chaves de pedaços fechados aguardando confirmação
    this.confirmed = new Set();    // chaves confirmadas pelo servidor nesta entrada
    this._lastSegmentId = 0;
    this._pump = null;             // promessa do laço de envio
    this._inflight = null;         // envio em andamento
    this._wake = null;             // acorda o laço antes do fim da espera
    this._stopping = false;
    this._blocked = null;          // erro 4xx permanente (sem consentimento etc.)
    this.persistChain = Promise.resolve();
    this.startedAt = null;
    this.connectedSources = new Set(); // track IDs já conectados pra evitar duplicar
    this._state = "idle"; // idle | recording | uploading | done | error
  }

  state() { return this._state; }
  _setState(s) { this._state = s; this.onStateChange(s); }

  async start() {
    if (this._state === "recording") throw new Error("already_recording");

    this.dek = this.dek || recallDek();
    await this._prepareStorage();

    // Web Audio context — destino unico onde local + remote serao mixados
    this.audioContext = new (window.AudioContext || window.webkitAudioContext)({
      sampleRate: 48000 // browser nativo; ffmpeg server-side baixa pra 16k pro Whisper
    });
    this.destination = this.audioContext.createMediaStreamDestination();
    this.destination.channelCount = 1;
    this.destination.channelCountMode = "explicit";

    this._attachAvailableTracks();

    // Paciente pode conectar depois / reconectar com track novo
    this._trackSubscribedHandler = (track, pub, participant) => {
      if (track.kind === "audio" && track.mediaStreamTrack) {
        this._connectTrack(track.mediaStreamTrack, "remote:" + participant.identity);
      }
    };
    this.room.on("trackSubscribed", this._trackSubscribedHandler);
    // Mic publicado depois, religado ou com dispositivo trocado gera um
    // MediaStreamTrack novo que nenhum evento de assinatura anuncia.
    this._rescanTimer = setInterval(() => this._attachAvailableTracks(), TRACK_RESCAN_MS);

    this.mimeType = pickSupportedMime();
    this.startedAt = Date.now();
    // Pedaços de uma entrada anterior (recarga/queda) que não chegaram a ser
    // confirmados entram primeiro na fila.
    await this._enqueueLeftovers();
    this._startPiece();
    this._pieceTimer = setInterval(() => { this._rotate().catch((err) => console.warn("[ai-capture] falha ao fechar pedaço", err)); }, this.pieceMs);

    // Recarga/fechamento: tenta emitir e guardar o último trecho (até 2 s).
    this._pageHideHandler = () => {
      try { if (this.recorder?.state === "recording") this.recorder.requestData(); } catch (_) { /* empty */ }
    };
    if (typeof window !== "undefined") window.addEventListener("pagehide", this._pageHideHandler);
    this._setState("recording");
  }

  async _prepareStorage() {
    // Sem DEK não dá pra cifrar em repouso: o áudio fica só em memória.
    if (!this.storage || !(this.dek instanceof Uint8Array) || this.dek.length !== 32) {
      this.storage = null;
      return;
    }
    try {
      this.cryptoKey = await crypto.subtle.importKey("raw", this.dek, "AES-GCM", false, ["encrypt", "decrypt"]);
      await this.storage.prune(Date.now() - PENDING_TTL_MS);
    } catch (err) {
      console.warn("[ai-capture] armazenamento local indisponível — áudio só em memória", err);
      this.storage = null;
    }
  }

  _attachAvailableTracks() {
    this.room.localParticipant?.audioTrackPublications?.forEach((pub) => {
      if (pub.audioTrack?.mediaStreamTrack) this._connectTrack(pub.audioTrack.mediaStreamTrack, "local");
    });
    this.room.remoteParticipants?.forEach((p) => {
      p.audioTrackPublications.forEach((pub) => {
        if (pub.audioTrack?.mediaStreamTrack) {
          this._connectTrack(pub.audioTrack.mediaStreamTrack, "remote:" + p.identity);
        }
      });
    });
  }

  _connectTrack(mediaStreamTrack, label) {
    if (this.connectedSources.has(mediaStreamTrack.id)) return;
    this.connectedSources.add(mediaStreamTrack.id);
    try {
      const stream = new MediaStream([mediaStreamTrack]);
      const source = this.audioContext.createMediaStreamSource(stream);
      source.connect(this.destination);
    } catch (e) {
      console.warn("[ai-capture] failed to connect track", label, e);
    }
  }

  // ─── Pedaços ───────────────────────────────────────────────────────────────

  // Cria o registro de um pedaço (sem gravador — usado também nos testes).
  _newPiece() {
    const segmentId = Math.max(Date.now(), this._lastSegmentId + 1);
    this._lastSegmentId = segmentId;
    const piece = { key: `${segmentId}-${randomSuffix()}`, segmentId, chunks: [], seq: 0, recorder: null, stopped: null };
    this.pieces.set(piece.key, piece);
    return piece;
  }

  _addChunk(piece, blob) {
    if (!blob || blob.size === 0) return;
    const seq = piece.seq++;
    piece.chunks.push(blob);
    this._persist(blob, seq, piece);
  }

  _startPiece() {
    const piece = this._newPiece();
    const recorder = new MediaRecorder(this.destination.stream, {
      mimeType: this.mimeType,
      audioBitsPerSecond: AUDIO_BITS_PER_SECOND,
    });
    piece.recorder = recorder;
    piece.stopped = new Promise((resolve) => { recorder.onstop = () => resolve(); });
    recorder.ondataavailable = (e) => this._addChunk(piece, e.data);
    recorder.start(TIMESLICE_MS);
    this.current = piece;
    this.recorder = recorder;
    return piece;
  }

  // Fecha o pedaço atual e começa outro. O novo gravador é ligado ANTES de
  // parar o antigo: sobreposição de milissegundos em vez de um buraco que
  // cortaria palavras.
  async _rotate() {
    if (this._state !== "recording" || this._stopping || !this.current) return;
    const old = this.current;
    this._startPiece();
    await this._closePiece(old);
  }

  async _closePiece(piece) {
    try { if (piece.recorder && piece.recorder.state !== "inactive") piece.recorder.stop(); } catch (_) { /* empty */ }
    if (piece.stopped) await piece.stopped;
    await this.persistChain;
    this._enqueue(piece.key);
  }

  _persist(blob, seq, piece) {
    if (!this.storage || !this.cryptoKey) return;
    const { key, segmentId } = piece;
    const mime = blob.type || this.mimeType || "audio/webm";
    this.persistChain = this.persistChain.then(async () => {
      const iv = crypto.getRandomValues(new Uint8Array(12));
      const data = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, this.cryptoKey, await blob.arrayBuffer());
      await this.storage.put({ sessionId: this.sessionId, segmentId, pieceKey: key, seq, mime, iv, data, createdAt: Date.now() });
    }).catch((err) => console.warn("[ai-capture] falha ao guardar trecho", err));
  }

  async _enqueueLeftovers() {
    if (!this.storage) return;
    try {
      const records = await this.storage.list(this.sessionId);
      const keys = [...new Set(records.map(keyOfRecord))].filter((k) => PIECE_KEY_RE.test(k));
      keys.sort((a, b) => Number(a.split("-")[0]) - Number(b.split("-")[0]));
      keys.forEach((k) => this._enqueue(k));
    } catch (err) {
      console.warn("[ai-capture] falha ao ler pedaços pendentes", err);
    }
  }

  _enqueue(key) {
    if (this.confirmed.has(key) || this.uploadQueue.includes(key)) return;
    this.uploadQueue.push(key);
    this._kick();
  }

  // ─── Envio em segundo plano ───────────────────────────────────────────────

  // Inicia o laço de envio se estiver parado. Não interrompe uma espera de
  // nova tentativa: pedaço novo na fila não muda o motivo da espera.
  _kick() {
    if (this._pump || this._stopping || this._blocked) return;
    this._pump = this._pumpLoop().finally(() => { this._pump = null; });
  }

  async _pumpLoop() {
    let failures = 0;
    while (!this._stopping && !this._blocked && this.uploadQueue.length) {
      const key = this.uploadQueue[0];
      this._inflight = this._uploadPiece(key);
      const outcome = await this._inflight.catch((err) => (err?.message === "DEK_INDISPONIVEL"
        ? { blocked: true, error: "DEK_INDISPONIVEL" }
        : { retry: true, error: err?.message }));
      this._inflight = null;
      if (outcome.done) {
        failures = 0;
        this.uploadQueue.shift();
        await this._forgetPiece(key);
        continue;
      }
      if (outcome.blocked) { this._blocked = outcome.error; break; }
      // Ocupado/rede: espera e tenta de novo (interrompível ao encerrar).
      const delay = outcome.retryAfterMs || RETRY_DELAYS_MS[Math.min(failures, RETRY_DELAYS_MS.length - 1)];
      failures += 1;
      await new Promise((resolve) => {
        const timer = setTimeout(resolve, delay);
        this._wake = () => { clearTimeout(timer); resolve(); };
      });
      this._wake = null;
    }
  }

  async _pieceBlob(key) {
    const piece = this.pieces.get(key);
    if (piece?.chunks.length) return new Blob(piece.chunks, { type: piece.chunks[0].type || this.mimeType });
    if (!this.storage || !this.cryptoKey) return null;
    const records = (await this.storage.list(this.sessionId)).filter((r) => keyOfRecord(r) === key);
    if (!records.length) return null;
    records.sort((a, b) => a.seq - b.seq);
    const plain = [];
    for (const record of records) plain.push(await crypto.subtle.decrypt({ name: "AES-GCM", iv: record.iv }, this.cryptoKey, record.data));
    return new Blob(plain, { type: records[0].mime || this.mimeType });
  }

  async _uploadPiece(key) {
    const blob = await this._pieceBlob(key);
    if (!blob || blob.size === 0) return { done: true }; // nada a enviar
    const idToken = await this.idTokenGetter();
    if (!idToken) return { retry: true, error: "no_id_token" };
    const envelope = await createAiSummaryEnvelope(this.dek || recallDek(), { sessionId: this.sessionId });
    let response;
    try {
      response = await fetch(`${this.backendBaseUrl}/therapy/session/${encodeURIComponent(this.sessionId)}/ai-piece`, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${idToken}`,
          "Content-Type": blob.type || this.mimeType,
          "X-AI-Piece-Key": key,
          ...envelope.headers,
        },
        body: blob,
      });
    } catch (err) {
      return { retry: true, error: err?.message || "network" };
    } finally {
      envelope.key.fill(0);
    }
    const data = await response.json().catch(() => ({}));
    if (response.ok && data.ok) { this.confirmed.add(key); return { done: true }; }
    // Resumo já pronto: o pedaço não serve mais.
    if (response.status === 409 && data.error === "AI_SUMMARY_JA_CONCLUIDO") return { done: true };
    if (response.status === 503 || response.status === 429 || response.status >= 500) {
      const retryAfterMs = Number(data.retryAfterSec) > 0 ? Number(data.retryAfterSec) * 1000 : 0;
      return { retry: true, retryAfterMs, error: data.error || `http_${response.status}` };
    }
    // 4xx restante (sem consentimento, IA desligada, sessão alheia): não
    // adianta repetir durante a consulta; o pedido de resumo devolve o erro.
    return { blocked: true, error: data.error || `http_${response.status}` };
  }

  async _forgetPiece(key) {
    this.pieces.delete(key);
    if (!this.storage) return;
    try { await this.storage.deletePiece(this.sessionId, key); } catch (err) {
      console.warn("[ai-capture] falha ao apagar pedaço confirmado", err);
    }
  }

  // Pedaços ainda não confirmados (memória + aparelho), em ordem de gravação.
  async _pendingPieces() {
    const keys = new Set();
    for (const piece of this.pieces.values()) if (piece.chunks.length) keys.add(piece.key);
    if (this.storage) {
      try {
        (await this.storage.list(this.sessionId)).forEach((r) => keys.add(keyOfRecord(r)));
      } catch (err) {
        console.warn("[ai-capture] falha ao ler trechos guardados", err);
      }
    }
    const ordered = [...keys]
      .filter((k) => PIECE_KEY_RE.test(k) && !this.confirmed.has(k))
      .sort((a, b) => Number(a.split("-")[0]) - Number(b.split("-")[0]));
    const pending = [];
    for (const key of ordered) {
      try {
        const blob = await this._pieceBlob(key);
        if (blob && blob.size > 0) pending.push({ key, blob });
      } catch (err) {
        console.warn("[ai-capture] pedaço guardado ilegível — ignorado", err);
      }
    }
    return pending;
  }

  async _clearStored() {
    if (!this.storage) return;
    try { await this.storage.deleteSession(this.sessionId); } catch (err) {
      console.warn("[ai-capture] falha ao apagar trechos enviados", err);
    }
  }

  _teardown() {
    clearInterval(this._rescanTimer);
    clearInterval(this._pieceTimer);
    try { this.room.off("trackSubscribed", this._trackSubscribedHandler); } catch (_) { /* empty */ }
    if (typeof window !== "undefined") window.removeEventListener("pagehide", this._pageHideHandler);
    try { this.audioContext?.close(); } catch (_) { /* empty */ }
  }

  async _waitInflight() {
    if (!this._inflight) return;
    await Promise.race([
      this._inflight.catch(() => {}),
      new Promise((resolve) => setTimeout(resolve, STOP_WAIT_INFLIGHT_MS)),
    ]);
  }

  /**
   * Para a gravação e pede o resumo. Só os pedaços ainda não confirmados vão
   * no corpo (pode ir vazio se tudo já foi transcrito durante a consulta).
   * Resolve com { ok, status } quando o servidor aceita (o resumo é async).
   */
  async stopAndUpload() {
    if (this._state !== "recording") {
      return { ok: false, error: "not_recording" };
    }
    this._stopping = true;
    if (this._wake) { const wake = this._wake; this._wake = null; wake(); }
    clearInterval(this._pieceTimer);

    // Fecha o último pedaço (último ondataavailable chega antes do onstop).
    if (this.current) {
      const last = this.current;
      this.current = null;
      try { if (last.recorder && last.recorder.state !== "inactive") last.recorder.stop(); } catch (_) { /* empty */ }
      if (last.stopped) await last.stopped;
    }
    this._teardown();
    await this.persistChain;
    await this._waitInflight();
    if (this._pump) await Promise.race([this._pump, new Promise((resolve) => setTimeout(resolve, 1000))]);

    const pending = await this._pendingPieces();
    if (pending.length === 0 && this.confirmed.size === 0) {
      this._setState("error");
      return { ok: false, error: "empty_recording" };
    }
    const durationSec = Math.round((Date.now() - (this.startedAt || Date.now())) / 1000);

    this._setState("uploading");
    try {
      const idToken = await this.idTokenGetter();
      if (!idToken) throw new Error("no_id_token");
      const result = await finalizeAiSummary({
        backendBaseUrl: this.backendBaseUrl, sessionId: this.sessionId, idToken,
        dek: this.dek || recallDek(), pieces: pending, mime: this.mimeType,
      });
      if (result.status === 409 && result.error === "AI_SUMMARY_JA_CONCLUIDO") await this._clearStored();
      if (!result.ok) {
        this._setState("error");
        return result;
      }
      // Não apaga o áudio aqui: o servidor só confirmou o recebimento; o
      // prontuário apaga quando o resumo fica pronto.
      this._setState("done");
      return { ok: true, status: result.status, durationSec, segments: pending.length };
    } catch (err) {
      this._setState("error");
      return { ok: false, error: err.message };
    }
  }

  /**
   * Interrompe sem pedir resumo (ex.: a aba vai fechar ou recarregar). Os
   * pedaços não confirmados permanecem no aparelho e são enviados na próxima
   * entrada na sala ou no encerramento.
   */
  async cancel() {
    this._stopping = true;
    if (this._wake) { const wake = this._wake; this._wake = null; wake(); }
    for (const piece of this.pieces.values()) {
      try { if (piece.recorder && piece.recorder.state !== "inactive") piece.recorder.stop(); } catch (_) { /* empty */ }
    }
    this._teardown();
    this.pieces.clear();
    this.current = null;
    this._setState("idle");
  }

  durationMs() {
    return this.startedAt ? Date.now() - this.startedAt : 0;
  }
}

// Pedido de resumo em modo pedaços (encerramento e "Tentar de novo"). O áudio
// pendente só existe neste aparelho: falhas de rede/servidor ganham novas
// tentativas antes de desistir.
async function finalizeAiSummary({ backendBaseUrl, sessionId, idToken, dek, pieces, mime }) {
  const blob = new Blob(pieces.map((p) => p.blob), { type: mime || "audio/webm" });
  const headers = {
    "Authorization": `Bearer ${idToken}`,
    "Content-Type": pieces[0]?.blob.type || mime || "audio/webm",
    "X-AI-Piece-Keys": pieces.map((p) => p.key).join(","),
  };
  if (pieces.length) headers["X-AI-Segments"] = pieces.map((p) => p.blob.size).join(",");
  const encryption = await createAiSummaryEnvelope(dek, { sessionId });
  let r;
  try {
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        r = await fetch(`${backendBaseUrl}/therapy/session/${encodeURIComponent(sessionId)}/ai-summarize`, {
          method: "POST",
          headers: { ...headers, ...encryption.headers },
          body: blob,
        });
        if (r.status < 500 && r.status !== 429) break;
      } catch (networkErr) {
        if (attempt === 3) throw networkErr;
      }
      if (attempt < 3) await new Promise((resolve) => setTimeout(resolve, 1500 * attempt));
    }
  } finally {
    encryption.key.fill(0);
  }
  const data = await r.json().catch(() => ({}));
  if (!r.ok || !data.ok) return { ok: false, error: data?.error || `http_${r.status}`, status: r.status };
  return { ok: true, status: data.status, segments: pieces.length };
}

// Pedaços guardados de uma sessão, decifrados, em ordem de gravação.
async function readStoredPieces(storage, sessionId, dek) {
  if (!storage || !(dek instanceof Uint8Array) || dek.length !== 32) return [];
  const key = await crypto.subtle.importKey("raw", dek, "AES-GCM", false, ["decrypt"]);
  const records = await storage.list(sessionId);
  const byKey = new Map();
  for (const record of records) {
    const k = keyOfRecord(record);
    if (!PIECE_KEY_RE.test(k)) continue;
    if (!byKey.has(k)) byKey.set(k, []);
    byKey.get(k).push(record);
  }
  const pieces = [];
  for (const [k, parts] of [...byKey].sort((a, b) => Number(a[0].split("-")[0]) - Number(b[0].split("-")[0]))) {
    parts.sort((a, b) => a.seq - b.seq);
    try {
      const plain = [];
      for (const part of parts) plain.push(await crypto.subtle.decrypt({ name: "AES-GCM", iv: part.iv }, key, part.data));
      pieces.push({ key: k, blob: new Blob(plain, { type: parts[0].mime }) });
    } catch (err) {
      console.warn("[ai-capture] pedaço guardado ilegível — ignorado", err);
    }
  }
  return pieces;
}

/** O áudio desta sessão ainda está guardado neste aparelho? */
export async function hasStoredAiAudio(sessionId) {
  const storage = createIndexedDbStorage();
  if (!storage) return false;
  try { return (await storage.list(sessionId)).length > 0; } catch { return false; }
}

/**
 * Refaz o pedido de resumo (processamento interrompido). Envia os pedaços que
 * ainda estiverem neste aparelho; os já confirmados estão no servidor — pode
 * não haver nenhum pedaço local e o reenvio ainda funcionar.
 */
export async function retryAiSummaryUpload({ sessionId, backendBaseUrl, idToken, dek }) {
  const key = dek || recallDek();
  const pieces = await readStoredPieces(createIndexedDbStorage(), sessionId, key);
  return finalizeAiSummary({
    backendBaseUrl: String(backendBaseUrl || "").replace(/\/+$/, ""), sessionId, idToken,
    dek: key, pieces, mime: pieces[0]?.blob.type || "audio/webm",
  });
}

/** Resumo pronto: o áudio guardado já não é necessário. */
export async function clearStoredAiAudio(sessionId) {
  const storage = createIndexedDbStorage();
  if (!storage) return;
  try { await storage.deleteSession(sessionId); } catch {}
}

function pickSupportedMime() {
  const candidates = [
    "audio/webm;codecs=opus",
    "audio/webm",
    "audio/ogg;codecs=opus",
    "audio/mp4"
  ];
  for (const m of candidates) {
    if (typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(m)) return m;
  }
  return "audio/webm"; // fallback (browser tentará algum default)
}

function createIndexedDbStorage() {
  if (typeof indexedDB === "undefined") return null;
  let dbPromise = null;
  const open = () => {
    dbPromise = dbPromise || new Promise((resolve, reject) => {
      const request = indexedDB.open("ep-ai-capture", 1);
      request.onupgradeneeded = () => {
        const store = request.result.createObjectStore("chunks", { autoIncrement: true });
        store.createIndex("sessionId", "sessionId");
        store.createIndex("createdAt", "createdAt");
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    return dbPromise;
  };
  const run = async (mode, operate) => {
    const db = await open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction("chunks", mode);
      let result;
      operate(tx.objectStore("chunks"), (value) => { result = value; });
      tx.oncomplete = () => resolve(result);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  };
  const deleteWhere = (store, request, match = () => true) => {
    request.onsuccess = () => {
      const cursor = request.result;
      if (cursor) {
        if (match(cursor.value)) cursor.delete();
        cursor.continue();
      }
    };
  };
  return {
    put: (record) => run("readwrite", (store) => { store.add(record); }),
    list: (sessionId) => run("readonly", (store, done) => {
      const request = store.index("sessionId").getAll(sessionId);
      request.onsuccess = () => done(request.result);
    }),
    deletePiece: (sessionId, pieceKey) => run("readwrite", (store) =>
      deleteWhere(store, store.index("sessionId").openCursor(sessionId), (record) => keyOfRecord(record) === pieceKey)),
    deleteSession: (sessionId) => run("readwrite", (store) => deleteWhere(store, store.index("sessionId").openCursor(sessionId))),
    prune: (before) => run("readwrite", (store) => deleteWhere(store, store.index("createdAt").openCursor(IDBKeyRange.upperBound(before)))),
  };
}
