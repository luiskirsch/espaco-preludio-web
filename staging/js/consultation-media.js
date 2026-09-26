// Shared by both ends of the consultation. Keep SDK and encryption worker aligned.
export const LIVEKIT_VERSION = '2.22.2';

export function consultationRoomOptions({ VideoPreset }, pixelDensity = globalThis.devicePixelRatio || 1) {
  return {
    adaptiveStream: { pixelDensity, pauseVideoInBackground: true },
    dynacast: true,
    videoCaptureDefaults: {
      facingMode: 'user',
      resolution: { width: 1280, height: 720, frameRate: 30 },
    },
    audioCaptureDefaults: {
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true,
    },
    publishDefaults: {
      dtx: true,
      red: true,
      simulcast: true,
      videoCodec: 'vp8',
      videoEncoding: { maxBitrate: 2_500_000, maxFramerate: 30, priority: 'high' },
      videoSimulcastLayers: [
        new VideoPreset(320, 180, 180_000, 30),
        new VideoPreset(640, 360, 600_000, 30),
      ],
      degradationPreference: 'maintain-framerate',
      audioPreset: { maxBitrate: 32_000 },
    },
  };
}

// Video elements belong to the page and must survive a track replacement or
// reconnection. Only dynamically created audio elements should be removed.
export function detachConsultationTrack(track) {
  for (const element of track.detach()) {
    if (element.tagName === 'AUDIO') element.remove();
  }
}
