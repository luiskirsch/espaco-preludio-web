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
// Nota: não usa os elementos <video> do DOM (que ficam display:none) —
// cria elementos off-screen próprios a partir das MediaStreamTracks do room,
// garantindo decodificação de frames em todos os browsers.
//
// Formato .ep-rec v2: JSON { format, version, sessionId, mimeType,
//   startedAt, durationMs, chunkCount, chunks: [{idx, ts, ciphertext, iv}] }

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

// Desenha `vid` cobrindo a área (x, y, w, h) como object-fit:cover + clip.
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

// Cria um <video> fora da viewport (NÃO display:none) com a MediaStreamTrack.
// display:none impede decodificação de frames em alguns browsers — posição
// off-screen garante que o browser processe os frames para o canvas.
function makeOffscreenVideo(mediaStreamTrack) {
  if (!mediaStreamTrack) return null;
  const v = document.createElement("video");
  v.autoplay    = true;
  v.muted       = true;
  v.playsInline = true;
  Object.assign(v.style, {
    position:      "fixed",
    top:           "-9999px",
    left:          "-9999px",
    width:         "1px",
    height:        "1px",
    pointerEvents: "none",
    opacity:       "0",
  });
  v.srcObject = new MediaStream([mediaStreamTrack]);
  document.body.appendChild(v);
  return v;
}

// Aguarda loadedmetadata (ou retorna imediatamente se já carregou).
function waitMetadata(videoEl) {
  return new Promise(resolve => {
    if (!videoEl || videoEl.readyState >= 1) { resolve(); return; }
    videoEl.addEventListener("loadedmetadata", resolve, { once: true });
    setTimeout(resolve, 3000); // timeout de segurança
  });
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
    this._offscreenEls     = []; // <video> off-screen criados aqui — removidos no stop
  }

  // room — instância LiveKit Room (fonte de tracks de vídeo e áudio)
  async start({ room } = {}) {
    if (this.recorder) throw new Error("already_recording");

    // ── Resolve tracks do room ──────────────────────────────────
    let localVideoMST  = null;
    let remoteVideoMST = null;
    let remoteAudioMST = null;

    if (room) {
      // Track de vídeo local (câmera do terapeuta)
      for (const pub of room.localParticipant.videoTrackPublications.values()) {
        const mst = pub.videoTrack?.mediaStreamTrack;
        if (mst && mst.readyState === "live") { localVideoMST = mst; break; }
      }

      // Tracks do primeiro participante remoto (paciente)
      for (const p of room.remoteParticipants.values()) {
        if (!remoteVideoMST) {
          for (const pub of p.videoTrackPublications.values()) {
            const mst = pub.track?.mediaStreamTrack;
            if (mst && mst.readyState === "live") { remoteVideoMST = mst; break; }
          }
        }
        if (!remoteAudioMST) {
          for (const pub of p.audioTrackPublications.values()) {
            const mst = pub.track?.mediaStreamTrack;
            if (mst && mst.readyState === "live") { remoteAudioMST = mst; break; }
          }
        }
        if (remoteVideoMST && remoteAudioMST) break;
      }
    }

    // ── Elementos off-screen para decodificação de frames ───────
    const localSrc  = makeOffscreenVideo(localVideoMST);
    const remoteSrc = makeOffscreenVideo(remoteVideoMST);
    if (localSrc)  this._offscreenEls.push(localSrc);
    if (remoteSrc) this._offscreenEls.push(remoteSrc);
    await Promise.all([waitMetadata(localSrc), waitMetadata(remoteSrc)]);

    // ── Áudio local (microfone) ──────────────────────────────────
    this._localAudioStream = await navigator.mediaDevices.getUserMedia({
      audio: true,
      video: false,
    });

    // ── AudioContext: mix local + remoto ─────────────────────────
    const audioCtx = new AudioContext();
    this._audioCtx = audioCtx;
    const dest = audioCtx.createMediaStreamDestination();

    audioCtx.createMediaStreamSource(this._localAudioStream).connect(dest);
    if (remoteAudioMST) {
      audioCtx.createMediaStreamSource(new MediaStream([remoteAudioMST])).connect(dest);
    }

    // ── Canvas HD 1280×720 ───────────────────────────────────────
    const W = 1280, H = 720;
    const canvas = document.createElement("canvas");
    canvas.width  = W;
    canvas.height = H;
    const ctx = canvas.getContext("2d", { alpha: false });

    const drawFrame = () => {
      const hasLocal  = localSrc  && localSrc.readyState  >= 2 && localSrc.videoWidth  > 0;
      const hasRemote = remoteSrc && remoteSrc.readyState >= 2 && remoteSrc.videoWidth > 0;

      ctx.fillStyle = "#0a0805";
      ctx.fillRect(0, 0, W, H);

      if (hasLocal && hasRemote) {
        drawCover(ctx, remoteSrc, 0,     0, W / 2, H); // paciente à esquerda
        drawCover(ctx, localSrc,  W / 2, 0, W / 2, H); // terapeuta à direita
        ctx.fillStyle = "rgba(0,0,0,0.5)";
        ctx.fillRect(W / 2 - 1, 0, 2, H);              // divisor central
      } else if (hasLocal) {
        drawCover(ctx, localSrc,  0, 0, W, H);
      } else if (hasRemote) {
        drawCover(ctx, remoteSrc, 0, 0, W, H);
      }
    };
    this._drawInterval = setInterval(drawFrame, Math.round(1000 / 24));

    // ── MediaRecorder VP9 + Opus ─────────────────────────────────
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
      videoBitsPerSecond: 1_200_000, // VP9 1.2 Mbps — excelente pra 1280×720 de rostos
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
      this._offscreenEls.forEach(v => { v.srcObject = null; v.remove(); });
      this._offscreenEls = [];
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
