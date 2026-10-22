/** Licensed stereo recordings, downloaded only after the listener presses play. */
const tracks = {
  forest: { url: new URL('./assets/diary/forest-recorded-v1.mp3', import.meta.url), overlap: 2.5 },
  piano: { url: new URL('./assets/diary/piano-unwind-v1.mp3', import.meta.url), overlap: .04 },
};
const recordings = new Map();

/** Join the recording to itself without mutating its original stereo samples. */
export function prepareRecordedLoop(context, recording, overlapSeconds) {
  const overlap = Math.min(Math.round(recording.sampleRate * overlapSeconds), Math.floor(recording.length / 8));
  const length = recording.length - overlap;
  const loop = context.createBuffer(recording.numberOfChannels, length, recording.sampleRate);
  for (let channel = 0; channel < recording.numberOfChannels; channel += 1) {
    const source = recording.getChannelData(channel);
    const target = loop.getChannelData(channel);
    target.set(source.subarray(overlap));
    for (let i = 0; i < overlap; i += 1) {
      const phase = i / overlap * Math.PI / 2;
      const index = length - overlap + i;
      target[index] = target[index] * Math.cos(phase) + source[i] * Math.sin(phase);
    }
  }
  return loop;
}

async function loadTrack(name, context, signal) {
  const track = tracks[name];
  signal?.throwIfAborted();
  let bytes = recordings.get(name);
  if (!bytes) {
    const response = await fetch(track.url, { signal, credentials: 'omit', cache: 'force-cache' });
    if (!response.ok) throw new Error(`Não foi possível carregar a trilha (${response.status}).`);
    bytes = await response.arrayBuffer();
  }
  signal?.throwIfAborted();
  // Decoding can detach its input; keep the compressed recording intact for later plays.
  const recording = await context.decodeAudioData(bytes.slice(0));
  signal?.throwIfAborted();
  recordings.set(name, bytes);
  return prepareRecordedLoop(context, recording, track.overlap);
}

export const loadForest = (context, signal) => loadTrack('forest', context, signal);
export const loadPiano = (context, signal) => loadTrack('piano', context, signal);
