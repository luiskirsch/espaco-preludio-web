// Espaço Prelúdio — captura de áudio mixado (local + remote) pra resumo IA.
//
// Distinto do session-record.js (gravação cifrada local pro arquivo do
// terapeuta). Aqui:
//   - Capturamos APENAS áudio (não vídeo) — Whisper só usa áudio
//   - Mixamos LocalAudioTrack + RemoteAudioTrack via Web Audio API
//   - Gravamos com MediaRecorder em webm/opus
//   - Ao parar, upload pro backend que transcreve + resume async
//
// Privacidade: a stream nunca sai do browser durante a sessão. Só sobe
// depois que profissional clica em "Encerrar". Áudio é deletado do servidor
// logo após processamento.

export class SessionAiCapture {
  constructor({ room, sessionId, backendBaseUrl, idTokenGetter, onStateChange }) {
    this.room = room;
    this.sessionId = sessionId;
    this.backendBaseUrl = String(backendBaseUrl || "").replace(/\/+$/, "");
    this.idTokenGetter = idTokenGetter || (() => null);
    this.onStateChange = onStateChange || (() => {});
    this.audioContext = null;
    this.destination = null;
    this.recorder = null;
    this.chunks = [];
    this.startedAt = null;
    this.connectedSources = new Set(); // track IDs já conectados pra evitar duplicar
    this._state = "idle"; // idle | recording | uploading | done | error
  }

  state() { return this._state; }
  _setState(s) { this._state = s; this.onStateChange(s); }

  async start() {
    if (this._state === "recording") throw new Error("already_recording");

    // Web Audio context — destino unico onde local + remote serao mixados
    this.audioContext = new (window.AudioContext || window.webkitAudioContext)({
      sampleRate: 48000 // browser nativo; ffmpeg server-side baixa pra 16k pro Whisper
    });
    this.destination = this.audioContext.createMediaStreamDestination();

    // 1. Conecta AUDIO LOCAL (mic do profissional)
    // LiveKit Room API: room.localParticipant.audioTrackPublications.values()
    const localPub = Array.from(this.room.localParticipant.audioTrackPublications.values())[0];
    if (localPub?.audioTrack?.mediaStreamTrack) {
      this._connectTrack(localPub.audioTrack.mediaStreamTrack, "local");
    }

    // 2. Conecta AUDIO REMOTO (todos os participantes remotos)
    this.room.remoteParticipants.forEach((p) => {
      p.audioTrackPublications.forEach((pub) => {
        if (pub.audioTrack?.mediaStreamTrack) {
          this._connectTrack(pub.audioTrack.mediaStreamTrack, "remote:" + p.identity);
        }
      });
    });

    // 3. Escuta tracks novos (paciente pode conectar depois)
    this._trackSubscribedHandler = (track, pub, participant) => {
      if (track.kind === "audio" && track.mediaStreamTrack) {
        this._connectTrack(track.mediaStreamTrack, "remote:" + participant.identity);
      }
    };
    // RoomEvent.TrackSubscribed (string event name)
    this.room.on("trackSubscribed", this._trackSubscribedHandler);

    // 4. Configura MediaRecorder no stream mixado
    const mimeType = pickSupportedMime();
    this.recorder = new MediaRecorder(this.destination.stream, { mimeType });
    this.startedAt = Date.now();
    this.recorder.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) this.chunks.push(e.data);
    };
    this.recorder.start(10000); // chunk a cada 10s (otimiza memória pra sessões longas)
    this._setState("recording");
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

  /**
   * Para a gravação e faz upload assíncrono. Retorna promessa que resolve
   * com { ok, status } depois que backend acusou recebimento (não espera
   * o processamento completar — esse é async no backend).
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

    // Cleanup audio graph
    try { this.room.off("trackSubscribed", this._trackSubscribedHandler); } catch (_) { /* empty */ }
    try { this.audioContext?.close(); } catch (_) { /* empty */ }

    if (this.chunks.length === 0) {
      this._setState("error");
      return { ok: false, error: "empty_recording" };
    }

    const mime = this.recorder.mimeType || "audio/webm";
    const blob = new Blob(this.chunks, { type: mime });
    const durationSec = Math.round((Date.now() - this.startedAt) / 1000);

    this._setState("uploading");

    try {
      const idToken = await this.idTokenGetter();
      if (!idToken) throw new Error("no_id_token");

      const r = await fetch(
        `${this.backendBaseUrl}/therapy/session/${encodeURIComponent(this.sessionId)}/ai-summarize`,
        {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${idToken}`,
            "Content-Type": mime
          },
          body: blob
        }
      );
      const data = await r.json().catch(() => ({}));
      if (!r.ok || !data.ok) {
        this._setState("error");
        return { ok: false, error: data?.error || `http_${r.status}`, status: r.status };
      }

      this._setState("done");
      return { ok: true, status: data.status, durationSec };
    } catch (err) {
      this._setState("error");
      return { ok: false, error: err.message };
    }
  }

  /** Cancela sem fazer upload (ex.: usuário desistir, erro inesperado). */
  async cancel() {
    if (this.recorder && this.recorder.state !== "inactive") {
      try { this.recorder.stop(); } catch (_) { /* empty */ }
    }
    try { this.room.off("trackSubscribed", this._trackSubscribedHandler); } catch (_) { /* empty */ }
    try { this.audioContext?.close(); } catch (_) { /* empty */ }
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
