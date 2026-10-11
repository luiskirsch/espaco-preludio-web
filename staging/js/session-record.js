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

// Desenha a imagem cobrindo a área (x, y, w, h) como object-fit:cover + clip.
function drawCover(ctx, { img, w: vw, h: vh }, x, y, w, h) {
  if (!vw || !vh) return;
  const vid = img;
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

// ─── Fonte de quadros que não para em aba oculta ───────────────────────────
// Com a aba do consultório em segundo plano (profissional abre outra aba ou
// janela), o Chrome limita timers a 1/s e pode pausar <video>. A gravação caía
// para 1 quadro/s enquanto a chamada seguia normal. MediaStreamTrackProcessor
// lê os quadros direto da track, sem depender de renderização da página.
function makeFrameSource(mst) {
  if (!mst) return null;
  if (typeof MediaStreamTrackProcessor === "function") {
    const track = mst.clone();
    const reader = new MediaStreamTrackProcessor({ track }).readable.getReader();
    let stopped = false;
    const src = {
      frame: null,
      current() { return src.frame ? { img: src.frame, w: src.frame.displayWidth, h: src.frame.displayHeight } : null; },
      ready: Promise.resolve(),
      stop() {
        stopped = true;
        reader.cancel().catch(() => {});
        track.stop();
        try { src.frame?.close(); } catch {}
        src.frame = null;
      },
    };
    (async () => {
      while (!stopped) {
        const { value, done } = await reader.read();
        if (done) break;
        if (stopped) { value.close(); break; }
        try { src.frame?.close(); } catch {}
        src.frame = value;
      }
    })().catch(() => {});
    return src;
  }
  // Fallback (navegadores sem MediaStreamTrackProcessor): <video> off-screen.
  const v = makeOffscreenVideo(mst);
  return {
    current() { return v.readyState >= 2 && v.videoWidth ? { img: v, w: v.videoWidth, h: v.videoHeight } : null; },
    ready: waitMetadata(v),
    stop() { v.srcObject = null; v.remove(); },
  };
}

// Relógio da gravação num Worker: timers de Worker não sofrem o limite de
// 1/s que o navegador aplica à página em segundo plano.
function startTicker(fps, onTick) {
  const ms = Math.round(1000 / fps);
  try {
    const code = "let id;onmessage=e=>{clearInterval(id);if(e.data>0)id=setInterval(()=>postMessage(0),e.data)}";
    const url = URL.createObjectURL(new Blob([code], { type: "text/javascript" }));
    const worker = new Worker(url);
    URL.revokeObjectURL(url);
    worker.onmessage = onTick;
    worker.postMessage(ms);
    return () => worker.terminate();
  } catch {
    const id = setInterval(onTick, ms);
    return () => clearInterval(id);
  }
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
    this._stopTicker       = null;
    this._frameSources     = [];
    this._audioCtx         = null;
    this._localAudioStream = null;
  }

  // room          — instância LiveKit Room (fonte de tracks locais e áudio remoto)
  // remoteVideoEl — <video> do paciente já em play (srcObject = stream descriptografado pelo LiveKit)
  async start({ room, remoteVideoEl } = {}) {
    if (this.recorder) throw new Error("already_recording");

    // ── Resolve tracks de vídeo ─────────────────────────────────
    let localVideoMST  = null;
    let remoteAudioMST = null;

    if (room) {
      // Track de vídeo local (câmera local é pré-criptografia — funciona direto)
      for (const pub of room.localParticipant.videoTrackPublications.values()) {
        const mst = pub.videoTrack?.mediaStreamTrack;
        if (mst && mst.readyState === "live") { localVideoMST = mst; break; }
      }
      // Áudio remoto via room (para AudioContext)
      for (const p of room.remoteParticipants.values()) {
        for (const pub of p.audioTrackPublications.values()) {
          const mst = pub.track?.mediaStreamTrack;
          if (mst && mst.readyState === "live") { remoteAudioMST = mst; break; }
        }
        if (remoteAudioMST) break;
      }
    }

    // ── Fontes de quadros ────────────────────────────────────────
    // Vídeo local: track direto do room (pré-E2EE, sem problema)
    const localSrc = makeFrameSource(localVideoMST);

    // Vídeo remoto: NÃO usar pub.track.mediaStreamTrack com E2EE (pode ser stream
    // cifrado antes de decodificação). Usar srcObject do elemento <video> que o
    // LiveKit já descriptografou e renderiza. Clonar em elemento off-screen
    // (não display:none) para garantir decodificação de frames pelo browser.
    let remoteSrc = null;
    if (remoteVideoEl?.srcObject) {
      const videoTracks = remoteVideoEl.srcObject.getVideoTracks().filter(t => t.readyState === "live");
      if (videoTracks.length) remoteSrc = makeFrameSource(videoTracks[0]);
    }

    this._frameSources = [localSrc, remoteSrc].filter(Boolean);
    await Promise.all(this._frameSources.map(src => src.ready));

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
      const local  = localSrc?.current()  || null;
      const remote = remoteSrc?.current() || null;
      const hasLocal = !!local, hasRemote = !!remote;

      ctx.fillStyle = "#0a0805";
      ctx.fillRect(0, 0, W, H);

      if (hasLocal && hasRemote) {
        drawCover(ctx, remote, 0,     0, W / 2, H); // paciente à esquerda
        drawCover(ctx, local,  W / 2, 0, W / 2, H); // terapeuta à direita
        ctx.fillStyle = "rgba(0,0,0,0.5)";
        ctx.fillRect(W / 2 - 1, 0, 2, H);              // divisor central
      } else if (hasLocal) {
        drawCover(ctx, local,  0, 0, W, H);
      } else if (hasRemote) {
        drawCover(ctx, remote, 0, 0, W, H);
      }
      // captureStream(0) + requestFrame: cada quadro desenhado vira um quadro
      // gravado, sem depender da pintura da página (que para em aba oculta).
      canvasVideoTrack?.requestFrame?.();
    };

    // ── MediaRecorder VP9 + Opus ─────────────────────────────────
    const canvasStream = canvas.captureStream(0);
    const canvasVideoTrack = canvasStream.getVideoTracks()[0];
    this._stopTicker = startTicker(24, drawFrame);
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
      this._stopTicker?.();
      this._frameSources.forEach(src => src.stop());
      this._frameSources = [];
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
