// Gravação local cifrada de sessão. Captura a stream local (terapeuta) +
// audio remoto se possível, cifra com DEK do terapeuta, oferece download
// como .ep-rec. Não sobe pro servidor — usuário guarda local.
//
// Decisão: local-only minimiza risco LGPD (sem retenção server-side), evita
// custo de storage cifrado e responsabilidade de playback. Terapeuta decide
// onde armazenar (cofre, pen-drive, nuvem pessoal).
//
// Formato .ep-rec: JSON com versão + metadata + chunks base64 cifrados (AES-GCM
// com DEK). Cada chunk vem com seu próprio IV. Reassemble: concatenar todos
// os chunks decifrados na ordem.

import { encryptNote } from "./crypto.js";

export class SessionRecorder {
  constructor({ sessionId, dek, onChunk, onStop, mimeType }) {
    this.sessionId = sessionId;
    this.dek = dek;
    this.onChunk = onChunk || (() => {});
    this.onStop = onStop || (() => {});
    this.mimeType = mimeType || "video/webm;codecs=vp9,opus";
    this.recorder = null;
    this.chunks = [];
    this.startedAt = null;
    this.stream = null;
  }

  async start({ video = true, audio = true } = {}) {
    if (this.recorder) throw new Error("already_recording");
    // Captura a stream local da câmera/mic. Remote audio fica fora da
    // gravação local (terapeuta grava o que ele vê/ouve do seu lado).
    this.stream = await navigator.mediaDevices.getUserMedia({ video, audio });
    if (!MediaRecorder.isTypeSupported(this.mimeType)) {
      // fallback pra default do browser
      this.mimeType = "video/webm";
    }
    this.recorder = new MediaRecorder(this.stream, { mimeType: this.mimeType });
    this.startedAt = Date.now();
    this.recorder.ondataavailable = async (e) => {
      if (!e.data || e.data.size === 0) return;
      const ab = await e.data.arrayBuffer();
      // Cifra cada chunk independentemente (chunk = ~5s de vídeo, ~500KB-1MB)
      const text = base64FromArrayBuffer(ab);
      const enc = await encryptNote(text, this.dek);
      this.chunks.push({
        idx: this.chunks.length,
        ts: Date.now() - this.startedAt,
        ciphertext: enc.ciphertext,
        iv: enc.iv
      });
      this.onChunk(this.chunks.length);
    };
    this.recorder.onstop = () => {
      this._releaseTracks();
      this.onStop(this._buildBlob());
    };
    this.recorder.start(5000); // chunk a cada 5s
  }

  stop() {
    if (!this.recorder) return;
    if (this.recorder.state !== "inactive") this.recorder.stop();
  }

  _releaseTracks() {
    if (this.stream) {
      this.stream.getTracks().forEach(t => t.stop());
      this.stream = null;
    }
  }

  _buildBlob() {
    const manifest = {
      format: "ep-rec",
      version: 1,
      sessionId: this.sessionId,
      mimeType: this.mimeType,
      startedAt: this.startedAt,
      durationMs: Date.now() - this.startedAt,
      chunkCount: this.chunks.length,
      chunks: this.chunks
    };
    const json = JSON.stringify(manifest);
    return new Blob([json], { type: "application/json" });
  }
}

function base64FromArrayBuffer(buffer) {
  const bytes = new Uint8Array(buffer);
  let bin = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    bin += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
  }
  return btoa(bin);
}

export function downloadRecording(blob, sessionId) {
  const ymd = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `sessao-${sessionId.slice(0, 8)}-${ymd}.ep-rec`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
