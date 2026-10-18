const recordingUrl = new URL('./assets/diary/cabin-rain-recorded-v1.mp3', import.meta.url);
let recordingBytes = null;

/** Preserve the natural recording, blending only its loop boundary. */
export function prepareRainLoop(context, recording) {
  const overlap = Math.min(Math.round(recording.sampleRate * .75), Math.floor(recording.length / 8));
  const length = recording.length - overlap;
  const loop = context.createBuffer(recording.numberOfChannels, length, recording.sampleRate);
  for (let channel = 0; channel < recording.numberOfChannels; channel++) {
    const source = recording.getChannelData(channel), target = loop.getChannelData(channel);
    target.set(source.subarray(overlap));
    for (let i = 0; i < overlap; i++) {
      const mix = .5 - .5 * Math.cos(Math.PI * i / overlap);
      const index = length - overlap + i;
      target[index] = target[index] * (1 - mix) + source[i] * mix;
    }
  }
  return loop;
}

/** Fetch a bundled field recording only after playback is requested. */
export async function loadCabinRain(context, signal) {
  let bytes = recordingBytes;
  if (!bytes) {
    const response = await fetch(recordingUrl, { signal, credentials: 'omit', cache: 'force-cache' });
    if (!response.ok) throw new Error('Não foi possível carregar a gravação de chuva.');
    bytes = await response.arrayBuffer();
    if (signal?.aborted) throw new DOMException('Playback stopped', 'AbortError');
  }
  const decoded = await context.decodeAudioData(bytes.slice(0));
  if (signal?.aborted) throw new DOMException('Playback stopped', 'AbortError');
  recordingBytes = bytes;
  return prepareRainLoop(context, decoded);
}
