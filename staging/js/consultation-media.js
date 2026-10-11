// Shared by both ends of the consultation. Keep SDK and encryption worker aligned.
export const LIVEKIT_VERSION = '2.22.2';

// ─── Perfis de vídeo ──────────────────────────────────────────────────────
// "premium" (computador com VP9): captura até 1080p e codifica em VP9 SVC
// (L3T3_KEY — o próprio fluxo carrega camadas 1080/540/270, então o servidor
// baixa a qualidade de quem estiver com rede ruim sem precisar de simulcast).
// VP9 entrega ~30% mais nitidez que VP8 na mesma banda: menos granulação.
// "mobile" (celular): VP8 720p com simulcast — encoder leve, não esquenta o
// aparelho, e funciona em qualquer navegador.
// Os dois usam degradação "balanced" (validado em 2026-05: maintain-resolution
// borrava movimento; maintain-framerate deixa a imagem granulada sob pressão).

const PREMIUM_MAX_BITRATE = 4_500_000; // 1080p30 VP9 limpo; congestionamento reduz sozinho
const MOBILE_MAX_BITRATE = 2_500_000;

function hasCodec(kind, mime) {
  try {
    const caps = kind === 'send' ? RTCRtpSender.getCapabilities?.('video') : RTCRtpReceiver.getCapabilities?.('video');
    return !!caps?.codecs?.some(c => c.mimeType?.toLowerCase() === mime);
  } catch { return false; }
}

export function canDecodeVp9() { return hasCodec('recv', 'video/vp9'); }

function isMobileDevice() {
  const ua = navigator.userAgent || '';
  return /Android|iPhone|iPad|iPod|Mobile/i.test(ua)
    || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1); // iPadOS se diz Mac
}

export function videoProfile() {
  return !isMobileDevice() && hasCodec('send', 'video/vp9') && canDecodeVp9() ? 'premium' : 'mobile';
}

function mobilePublishOptions(VideoPreset) {
  return {
    simulcast: true,
    videoCodec: 'vp8',
    videoEncoding: { maxBitrate: MOBILE_MAX_BITRATE, maxFramerate: 30, priority: 'high' },
    videoSimulcastLayers: [
      new VideoPreset(320, 180, 200_000, 30),
      new VideoPreset(960, 540, 1_100_000, 30),
    ],
    degradationPreference: 'balanced',
  };
}

// pauseVideoInBackground: no celular do paciente economiza dados/bateria. No
// consultório fica desligado — o profissional troca de aba (prontuário, PDF)
// e a gravação/IA não podem perder o vídeo do paciente nesse meio-tempo.
export function consultationRoomOptions({ VideoPreset }, pixelDensity = globalThis.devicePixelRatio || 1, { pauseVideoInBackground = true } = {}) {
  const premium = videoProfile() === "premium";
  return {
    adaptiveStream: { pixelDensity, pauseVideoInBackground },
    dynacast: true,
    videoCaptureDefaults: {
      facingMode: 'user',
      // A câmera entrega o máximo que suporta até esse teto (webcam 720p segue 720p).
      resolution: premium ? { width: 1920, height: 1080, frameRate: 30 } : { width: 1280, height: 720, frameRate: 30 },
    },
    audioCaptureDefaults: {
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true,
    },
    publishDefaults: {
      dtx: true,
      red: true,
      ...(premium
        ? {
            simulcast: false,
            videoCodec: 'vp9',
            videoEncoding: { maxBitrate: PREMIUM_MAX_BITRATE, maxFramerate: 30, priority: 'high' },
            degradationPreference: 'balanced',
          }
        : mobilePublishOptions(VideoPreset)),
      // Voz é o centro da sessão: Opus a 48 kbps soa mais natural que 32.
      audioPreset: { maxBitrate: 48_000, priority: 'high' },
    },
  };
}

// ─── Negociação de codec ──────────────────────────────────────────────────
// Com criptografia ponta a ponta o LiveKit não publica codec reserva
// (backupCodec), então quem recebe precisa decodificar o codec publicado.
// Cada lado anuncia por dados se decodifica VP9; se alguém na sala não
// decodifica, a câmera é republicada em VP8 (piscada de ~1s, só nesse caso).
const CAPS_TOPIC = 'ep:media-caps';

export function setupCodecNegotiation(room, livekitMod) {
  const { RoomEvent, Track, VideoPreset } = livekitMod;
  const remoteVp9 = new Map(); // identity → boolean
  let switching = false;
  const enc = new TextEncoder();
  const dec = new TextDecoder();

  function announce(destinationIdentities) {
    const payload = enc.encode(JSON.stringify({ t: 'caps', vp9: canDecodeVp9() }));
    room.localParticipant.publishData(payload, { reliable: true, topic: CAPS_TOPIC, destinationIdentities })
      .catch(() => {});
  }

  async function ensureCodec() {
    if (switching) return;
    const pub = room.localParticipant.getTrackPublication(Track.Source.Camera);
    const track = pub?.track;
    if (!track || track.codec !== 'vp9') return;
    const someoneCantDecode = [...remoteVp9.values()].some(v => v === false);
    if (!someoneCantDecode) return;
    switching = true;
    try {
      console.info('[media] participante sem VP9 — republicando câmera em VP8');
      await room.localParticipant.unpublishTrack(track, false);
      await room.localParticipant.publishTrack(track, {
        source: Track.Source.Camera,
        ...mobilePublishOptions(VideoPreset),
        videoEncoding: { maxBitrate: 3_000_000, maxFramerate: 30, priority: 'high' },
      });
    } catch (err) {
      console.warn('codec_fallback_error', err);
    } finally {
      switching = false;
    }
  }

  room
    .on(RoomEvent.DataReceived, (payload, participant, _kind, topic) => {
      if (topic !== CAPS_TOPIC || !participant) return;
      try {
        const msg = JSON.parse(dec.decode(payload));
        if (msg?.t !== 'caps') return;
        remoteVp9.set(participant.identity, msg.vp9 === true);
        ensureCodec();
      } catch {}
    })
    .on(RoomEvent.ParticipantConnected, p => announce([p.identity]))
    .on(RoomEvent.ParticipantDisconnected, p => remoteVp9.delete(p.identity))
    .on(RoomEvent.LocalTrackPublished, () => ensureCodec())
    .on(RoomEvent.Connected, () => announce());

  // Se a sala já estiver conectada quando isto rodar.
  if (room.state === 'connected') announce();
}

// Video elements belong to the page and must survive a track replacement or
// reconnection. Only dynamically created audio elements should be removed.
export function detachConsultationTrack(track) {
  for (const element of track.detach()) {
    if (element.tagName === 'AUDIO') element.remove();
  }
}
