// Espaço Prelúdio — captura de áudio mixado (local + remote) pra resumo IA.

import { recallDek } from "./crypto.js";
import { createAiSummaryEnvelope } from "./ai-summary-crypto.js";
//
// Distinto do session-record.js (gravação cifrada local pro arquivo do
// terapeuta). Aqui:
//   - Capturamos APENAS áudio (não vídeo) — Whisper só usa áudio
//   - Mixamos LocalAudioTrack + RemoteAudioTrack via Web Audio API
//   - Gravamos com MediaRecorder em webm/opus mono (voz; ~11 MB por hora)
//   - Ao encerrar, upload pro backend que transcreve + resume async
//
// Privacidade: o áudio só sai do browser quando o profissional encerra a
// sessão. Até lá, cada trecho de 2 s fica no IndexedDB desta máquina cifrado
// com a DEK do profissional, para que recarregar a página ou reentrar na sala
// não descarte o que já foi falado: cada entrada vira um segmento e todos
// sobem juntos no fim. Após o envio os trechos são apagados; sobras de
// sessões abandonadas expiram em 3 dias. Áudio é deletado do servidor logo
// após processamento.

// Numa recarga, o que ainda não virou trecho se perde (a gravação no
// IndexedDB durante o unload não termina a tempo): 2 s é o teto dessa perda.
const TIMESLICE_MS = 2000;
const TRACK_RESCAN_MS = 3000;
const AUDIO_BITS_PER_SECOND = 24_000;
const PENDING_TTL_MS = 3 * 24 * 60 * 60 * 1000;

export class SessionAiCapture {
  constructor({ room, sessionId, backendBaseUrl, idTokenGetter, onStateChange, dek, storage }) {
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
    this.recorder = null;
    this.chunks = [];
    this.segmentId = null;
    this.seq = 0;
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

    const mimeType = pickSupportedMime();
    this.recorder = new MediaRecorder(this.destination.stream, {
      mimeType,
      audioBitsPerSecond: AUDIO_BITS_PER_SECOND,
    });
    this.segmentId = Date.now();
    this.seq = 0;
    this.startedAt = Date.now();
    this.recorder.ondataavailable = (e) => {
      if (!e.data || e.data.size === 0) return;
      const seq = this.seq++;
      this.chunks.push(e.data);
      this._persist(e.data, seq);
    };
    // Recarga/fechamento: tenta emitir e guardar o último trecho (até 2 s).
    this._pageHideHandler = () => {
      try { if (this.recorder?.state === "recording") this.recorder.requestData(); } catch (_) { /* empty */ }
    };
    if (typeof window !== "undefined") window.addEventListener("pagehide", this._pageHideHandler);
    this.recorder.start(TIMESLICE_MS);
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

  _persist(blob, seq) {
    if (!this.storage || !this.cryptoKey) return;
    const segmentId = this.segmentId;
    const mime = blob.type || this.recorder?.mimeType || "audio/webm";
    this.persistChain = this.persistChain.then(async () => {
      const iv = crypto.getRandomValues(new Uint8Array(12));
      const data = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, this.cryptoKey, await blob.arrayBuffer());
      await this.storage.put({ sessionId: this.sessionId, segmentId, seq, mime, iv, data, createdAt: Date.now() });
    }).catch((err) => console.warn("[ai-capture] falha ao guardar trecho", err));
  }

  // Segmentos de entradas anteriores (IndexedDB) + o atual (memória, que
  // está completo mesmo se algum trecho falhou ao ser guardado).
  async _collectSegments() {
    const segments = [];
    if (this.storage && this.cryptoKey) {
      let records = [];
      try {
        records = await this.storage.list(this.sessionId);
      } catch (err) {
        console.warn("[ai-capture] falha ao ler trechos guardados", err);
      }
      const bySegment = new Map();
      for (const record of records) {
        if (record.segmentId === this.segmentId) continue;
        if (!bySegment.has(record.segmentId)) bySegment.set(record.segmentId, []);
        bySegment.get(record.segmentId).push(record);
      }
      for (const [, parts] of [...bySegment].sort((a, b) => a[0] - b[0])) {
        parts.sort((a, b) => a.seq - b.seq);
        try {
          const plain = [];
          for (const part of parts) {
            plain.push(await crypto.subtle.decrypt({ name: "AES-GCM", iv: part.iv }, this.cryptoKey, part.data));
          }
          segments.push(new Blob(plain, { type: parts[0].mime }));
        } catch (err) {
          console.warn("[ai-capture] segmento guardado ilegível — ignorado", err);
        }
      }
    }
    if (this.chunks.length) {
      segments.push(new Blob(this.chunks, { type: this.recorder?.mimeType || "audio/webm" }));
    }
    return segments;
  }

  async _clearStored() {
    if (!this.storage) return;
    try { await this.storage.deleteSession(this.sessionId); } catch (err) {
      console.warn("[ai-capture] falha ao apagar trechos enviados", err);
    }
  }

  _teardown() {
    clearInterval(this._rescanTimer);
    try { this.room.off("trackSubscribed", this._trackSubscribedHandler); } catch (_) { /* empty */ }
    if (typeof window !== "undefined") window.removeEventListener("pagehide", this._pageHideHandler);
    try { this.audioContext?.close(); } catch (_) { /* empty */ }
  }

  /**
   * Para a gravação e faz upload de todos os segmentos da sessão. Retorna
   * promessa que resolve com { ok, status } depois que backend acusou
   * recebimento (não espera o processamento — esse é async no backend).
   */
  async stopAndUpload() {
    if (!this.recorder || this._state !== "recording") {
      return { ok: false, error: "not_recording" };
    }

    // Espera ondataavailable do último chunk
    const stopP = new Promise((resolve) => {
      this.recorder.onstop = () => resolve();
    });
    this.recorder.stop();
    await stopP;
    this._teardown();
    await this.persistChain;

    const segments = await this._collectSegments();
    if (segments.length === 0) {
      this._setState("error");
      return { ok: false, error: "empty_recording" };
    }

    const mime = this.recorder.mimeType || "audio/webm";
    const blob = new Blob(segments, { type: mime });
    const durationSec = Math.round((Date.now() - this.startedAt) / 1000);

    this._setState("uploading");

    try {
      const idToken = await this.idTokenGetter();
      if (!idToken) throw new Error("no_id_token");
      const dek = this.dek || recallDek();
      const encryption = await createAiSummaryEnvelope(dek);

      // O áudio só existe neste aparelho: falhas de rede/servidor ganham novas
      // tentativas antes de desistir.
      let r;
      try {
        for (let attempt = 1; attempt <= 3; attempt++) {
          try {
            r = await fetch(
              `${this.backendBaseUrl}/therapy/session/${encodeURIComponent(this.sessionId)}/ai-summarize`,
              {
                method: "POST",
                headers: {
                  "Authorization": `Bearer ${idToken}`,
                  "Content-Type": mime,
                  "X-AI-Segments": segments.map((segment) => segment.size).join(","),
                  ...encryption.headers,
                },
                body: blob
              }
            );
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
      if (r.status === 409 && data?.error === "AI_SUMMARY_JA_CONCLUIDO") await this._clearStored();
      if (!r.ok || !data.ok) {
        this._setState("error");
        return { ok: false, error: data?.error || `http_${r.status}`, status: r.status };
      }

      await this._clearStored();
      this._setState("done");
      return { ok: true, status: data.status, durationSec, segments: segments.length };
    } catch (err) {
      this._setState("error");
      return { ok: false, error: err.message };
    }
  }

  /**
   * Interrompe sem enviar (ex.: a aba vai fechar ou recarregar). Os trechos
   * já guardados permanecem no aparelho e entram no envio quando a sessão
   * for encerrada numa próxima entrada na sala.
   */
  async cancel() {
    if (this.recorder && this.recorder.state !== "inactive") {
      try { this.recorder.stop(); } catch (_) { /* empty */ }
    }
    this._teardown();
    this.chunks = [];
    this._setState("idle");
  }

  durationMs() {
    return this.startedAt ? Date.now() - this.startedAt : 0;
  }
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
  const deleteWhere = (store, request) => {
    request.onsuccess = () => {
      const cursor = request.result;
      if (cursor) { cursor.delete(); cursor.continue(); }
    };
  };
  return {
    put: (record) => run("readwrite", (store) => { store.add(record); }),
    list: (sessionId) => run("readonly", (store, done) => {
      const request = store.index("sessionId").getAll(sessionId);
      request.onsuccess = () => done(request.result);
    }),
    deleteSession: (sessionId) => run("readwrite", (store) => deleteWhere(store, store.index("sessionId").openCursor(sessionId))),
    prune: (before) => run("readwrite", (store) => deleteWhere(store, store.index("createdAt").openCursor(IDBKeyRange.upperBound(before)))),
  };
}
