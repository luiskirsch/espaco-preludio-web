// Gravação local cifrada de sessão.
//
// Captura o vídeo local (terapeuta) + vídeo remoto (paciente via LiveKit),
// compõe lado-a-lado num canvas 1280×720 a 24fps, mistura os áudios via
// AudioContext, cifra cada chunk com AES-GCM usando a DEK do terapeuta.
// Nada sobe pro servidor — download local em .ep-rec.
//
// Layout: paciente à esquerda | terapeuta à direita.
// Fallback automático se um dos lados não tiver vídeo (full-width do lado ativo).
//
// Formato .ep-rec v2: JSON { format, version, sessionId, mimeType,
//   startedAt, durationMs, chunkCount, chunks: [{idx, ts, ciphertext, iv}] }
// Reassemble: concatenar ArrayBuffers dos chunks decifrados, em ordem de idx.

import { encryptNote } from "./crypto.js";

// ─── Helpers ────────────────────────────────────────────────────────────────

function base64FromArrayBuffer(buffer) {
  const bytes = new Uint8Array(buffer);
  let bin = "";
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    bin += String.fromCharCode.apply(null, bytes.subarray(i, i + CHUNK));
  }
  return btoa(bin);
}

// Desenha `vid` cobrindo a área (x, y, w, h) com object-fit:cover + clip.
function drawCover(ctx, vid, x, y, w, h) {
  const vw = vid.videoWidth, vh = vid.videoHeight;
  if (!vw || !vh) return;
  const scale = Math.max(w / vw, h / vh);
  const sw = vw * scale, sh = vh * scale;
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, w, h);
  ctx.clip();
  ctx.drawImage(vid, x + (w - sw) / 2, y + (h - sh) / 2, sw, sh);
  ctx.restore();
}

// ─── SessionRecorder ────────────────────────────────────────────────────────

export class SessionRecorder {
  constructor({ sessionId, dek, onChunk, onStop }) {
    this.sessionId  = sessionId;
    this.dek        = dek;
    this.onChunk    = onChunk || (() => {});
    this.onStop     = onStop  || (() => {});
    this.recorder   = null;
    this.chunks     = [];
    this.startedAt  = null;
    this.mimeType   = "video/webm;codecs=vp9,opus";
    this._drawInterval     = null;
    this._audioCtx         = null;
    this._localAudioStream = null;
  }

  // localVideoEl  — <video> do terapeuta (já reproduzindo via LiveKit)
  // remoteVideoEl — <video> do paciente  (já reproduzindo via LiveKit)
  // room          — instância LiveKit Room (fallback p/ áudio remoto)
  async start({ localVideoEl, remoteVideoEl, room } = {}) {
    if (this.recorder) throw new Error("already_recording");

    // ── Áudio local (microfone) ──────────────────────────────────
    this._localAudioStream = await navigator.mediaDevices.getUserMedia({
      audio: true,
      video: false,
    });

    // ── Canvas HD ────────────────────────────────────────────────
    const W = 1280, H = 720;
    const canvas = document.createElement("canvas");
    canvas.width  = W;
    canvas.height = H;
    const ctx = canvas.getContext("2d", { alpha: false });

    // ── AudioContext: mix local + remoto ─────────────────────────
    const audioCtx = new AudioContext();
    this._audioCtx = audioCtx;
    const dest = audioCtx.createMediaStreamDestination();

    // Mic local
    audioCtx.createMediaStreamSource(this._localAudioStream).connect(dest);

    // Áudio remoto: LiveKit não expõe áudio no srcObject do <video>;
    // acessa direto pelo mediaStreamTrack da publicação do room.
    if (room) {
      for (const p of room.remoteParticipants.values()) {
        for (const pub of p.audioTrackPublications.values()) {
          const mst = pub.track?.mediaStreamTrack;
          if (mst && mst.readyState === "live") {
            audioCtx.createMediaStreamSource(new MediaStream([mst])).connect(dest);
            break;
          }
        }
      }
    }

    // ── Loop de desenho 24fps ────────────────────────────────────
    const drawFrame = () => {
      const hasLocal  = localVideoEl  && localVideoEl.readyState  >= 2 && localVideoEl.videoWidth  > 0;
      const hasRemote = remoteVideoEl && remoteVideoEl.readyState >= 2 && remoteVideoEl.videoWidth > 0;

      ctx.fillStyle = "#0a0805";
      ctx.fillRect(0, 0, W, H);

      if (hasLocal && hasRemote) {
        drawCover(ctx, remoteVideoEl, 0,     0, W / 2, H);
        drawCover(ctx, localVideoEl,  W / 2, 0, W / 2, H);
        // separador sutil entre os dois lados
        ctx.fillStyle = "rgba(0,0,0,0.45)";
        ctx.fillRect(W / 2 - 1, 0, 2, H);
      } else if (hasLocal) {
        drawCover(ctx, localVideoEl,  0, 0, W, H);
      } else if (hasRemote) {
        drawCover(ctx, remoteVideoEl, 0, 0, W, H);
      }
    };
    this._drawInterval = setInterval(drawFrame, Math.round(1000 / 24));

    // ── MediaRecorder com VP9 + Opus ─────────────────────────────
    const canvasStream = canvas.captureStream(24);
    const mixedStream  = new MediaStream([
      ...canvasStream.getVideoTracks(),
      ...dest.stream.getAudioTracks(),
    ]);

    if (!MediaRecorder.isTypeSupported(this.mimeType)) {
      this.mimeType = "video/webm";
    }
    this.recorder = new MediaRecorder(mixedStream, {
      mimeType: this.mimeType,
      videoBitsPerSecond: 1_200_000, // VP9 1.2 Mbps — ~40% + eficiente que VP8 equivalente
      audioBitsPerSecond:   128_000, // Opus 128 kbps — transparente pra voz
    });

    this.startedAt = Date.now();

    this.recorder.ondataavailable = async (e) => {
      if (!e.data || e.data.size === 0) return;
      const text = base64FromArrayBuffer(await e.data.arrayBuffer());
      const enc  = await encryptNote(text, this.dek);
      this.chunks.push({
        idx:        this.chunks.length,
        ts:         Date.now() - this.startedAt,
        ciphertext: enc.ciphertext,
        iv:         enc.iv,
      });
      this.onChunk(this.chunks.length);
    };

    this.recorder.onstop = () => {
      clearInterval(this._drawInterval);
      this._localAudioStream?.getTracks().forEach(t => t.stop());
      this._audioCtx?.close().catch(() => {});
      this.onStop(this._buildBlob());
    };

    this.recorder.start(5000); // chunk cifrado a cada 5s
  }

  stop() {
    if (this.recorder && this.recorder.state !== "inactive") this.recorder.stop();
  }

  _buildBlob() {
    return new Blob([JSON.stringify({
      format:     "ep-rec",
      version:    2,
      sessionId:  this.sessionId,
      mimeType:   this.mimeType,
      startedAt:  this.startedAt,
      durationMs: Date.now() - this.startedAt,
      chunkCount: this.chunks.length,
      chunks:     this.chunks,
    })], { type: "application/json" });
  }
}

export function downloadRecording(blob, sessionId) {
  const ymd = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `sessao-${sessionId.slice(0, 8)}-${ymd}.ep-rec`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
