const EASINGS = { forward: [.6, .02, .28, 1], backward: [.45, 0, .25, 1] };

export function bookMotionTiming(element, direction = 'forward') {
  const style = getComputedStyle(element.closest('.book-frame') || element);
  const prefix = direction === 'backward' ? 'close' : 'open';
  const value = style.getPropertyValue(`--book-${prefix}-duration`).trim();
  const duration = parseFloat(value) * (value.endsWith('ms') ? 1 : 1000);
  const easing = style.getPropertyValue(`--book-${prefix}-easing`).match(/-?\d*\.?\d+/g)?.map(Number);
  return { duration: duration > 0 ? duration : prefix === 'open' ? 1500 : 1300, easing: easing?.length === 4 ? easing : EASINGS[direction] };
}

function progressAt(time, [x1, y1, x2, y2]) {
  const curve = (t, a, b) => 3 * (1 - t) ** 2 * t * a + 3 * (1 - t) * t ** 2 * b + t ** 3;
  let low = 0, high = 1;
  for (let step = 0; step < 14; step++) {
    const mid = (low + high) / 2;
    if (curve(mid, x1, x2) < time) low = mid; else high = mid;
  }
  return curve((low + high) / 2, y1, y2);
}

/** Recorded material textures at their original pitch, shaped by the motion. */
export function renderBookFoley({ sampleRate, duration, material, direction = 'forward', paper, leather, impact, easing = EASINGS[direction] }) {
  const closing = material === 'leather' && direction === 'backward';
  const samples = new Float32Array(Math.ceil(sampleRate * (duration + (closing ? .14 : .025))));
  let seed = 4117;
  const random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 2147483648 - 1; };
  if (material === 'paper' && paper?.length) {
    // Overlapping, windowed grains extend a short rustle without slowing its pitch.
    const grain = Math.round(sampleRate * .085), hop = Math.round(sampleRate * .025);
    for (let start = -grain; start < samples.length; start += hop) {
      const offset = Math.floor((.15 + (random() + 1) * .3) * Math.max(1, paper.length - grain));
      for (let i = 0; i < grain; i++) {
        const target = start + i;
        if (target >= 0 && target < samples.length) samples[target] += paper[Math.min(paper.length - 1, offset + i)] * Math.sin(Math.PI * i / grain) ** 2;
      }
    }
  }
  // Sample the same Bézier curve as the moving sheet/cover, then let its speed
  // shape the friction. A 1ms lookup keeps synthesis off the animation's hot path.
  const steps = Math.ceil(duration * 1000), motion = new Float32Array(steps + 1), velocity = new Float32Array(steps + 1);
  let fastest = .001;
  for (let i = 0; i <= steps; i++) motion[i] = progressAt(i / steps, easing);
  for (let i = 1; i <= steps; i++) { velocity[i] = motion[i] - motion[i - 1]; fastest = Math.max(fastest, velocity[i]); }
  // A single natural gesture, without looping or stretching the leather.
  const leatherOffset = Math.max(0, Math.floor(((leather?.length || 0) - duration * sampleRate) / 2));
  for (let i = 0; i < samples.length; i++) {
    const time = i / sampleRate, index = Math.min(steps, Math.floor(time / duration * steps));
    const speed = Math.min(1, velocity[index] / fastest);
    const edge = Math.min(1, time / .025, Math.max(0, duration - time) / .055);
    const envelope = speed ** .65 * Math.max(0, edge);
    if (material === 'paper') samples[i] *= envelope;
    else samples[i] = (leather?.[leatherOffset + i] || 0) * envelope;
  }
  let peak = .001;
  for (const value of samples) peak = Math.max(peak, Math.abs(value));
  const level = material === 'paper' ? .68 : closing ? .12 : .22;
  for (let i = 0; i < samples.length; i++) samples[i] *= level / peak;
  // Keep the approved board contact independent of the quieter movement.
  if (closing && impact?.length) {
    let peakIndex = 0;
    for (let i = 1; i < impact.length; i++) if (Math.abs(impact[i]) > Math.abs(impact[peakIndex])) peakIndex = i;
    const start = Math.round(duration * sampleRate) - peakIndex;
    const gain = .85 / Math.max(.001, Math.abs(impact[peakIndex]));
    for (let i = 0; i < impact.length; i++) {
      const target = start + i;
      if (target >= 0 && target < samples.length) samples[target] += impact[i] * gain;
    }
  }
  return samples;
}

/** One audio clock for paper and leather. Nothing plays before an action. */
export function createBookFoley({ paperUrl, leatherUrl, impactUrl, getVolume = () => .14 } = {}) {
  let context, loading, loadingLeather, loadingImpact, recordedPaper, recordedLeather, recordedImpact, destroyed = false;
  const buffers = new Map(), requests = new Map(), active = new Map();
  const host = globalThis.document;

  function prepare() {
    if (destroyed) return Promise.resolve(false);
    const Context = globalThis.AudioContext || globalThis.webkitAudioContext;
    if (!Context) return Promise.resolve(false);
    try {
      context ||= new Context({ latencyHint: 'interactive' });
      context.onstatechange = () => { if (context.state !== 'running' && active.size) stop(); };
      if (!loading && !recordedPaper && paperUrl) {
        loading = fetch(paperUrl).then(response => { if (!response.ok) throw new Error('PAPEL_INDISPONIVEL'); return response.arrayBuffer(); })
          .then(bytes => context.decodeAudioData(bytes)).then(buffer => { recordedPaper = buffer.getChannelData(0); }).catch(() => { loading = null; });
      }
      if (!loadingImpact && !recordedImpact && impactUrl) {
        loadingImpact = fetch(impactUrl).then(response => { if (!response.ok) throw new Error('CAPA_INDISPONIVEL'); return response.arrayBuffer(); })
          .then(bytes => context.decodeAudioData(bytes)).then(buffer => { recordedImpact = buffer.getChannelData(0); }).catch(() => { loadingImpact = null; });
      }
      if (!loadingLeather && !recordedLeather && leatherUrl) {
        loadingLeather = fetch(leatherUrl).then(response => { if (!response.ok) throw new Error('COURO_INDISPONIVEL'); return response.arrayBuffer(); })
          .then(bytes => context.decodeAudioData(bytes)).then(buffer => { recordedLeather = buffer.getChannelData(0); }).catch(() => { loadingLeather = null; });
      }
      return Promise.resolve(context.state === 'suspended' ? context.resume() : undefined).then(() => context.state === 'running').catch(() => false);
    } catch { return Promise.resolve(false); }
  }

  function stop(material) {
    for (const kind of material ? [material] : ['paper', 'leather']) {
      requests.set(kind, (requests.get(kind) || 0) + 1);
      const current = active.get(kind);
      if (current) {
        active.delete(kind);
        try {
          const time = context.currentTime;
          current.gain.gain.cancelScheduledValues(time);
          current.gain.gain.setTargetAtTime(0, time, .004);
          current.source.stop(time + .02);
        } catch { /* Already ended. */ }
      }
    }
  }

  async function play(material, { direction = 'forward', animation = null, duration = direction === 'backward' ? 1300 : 1500, easing = EASINGS[direction], invitation = false } = {}) {
    stop(material);
    const request = requests.get(material), requestedAt = performance.now();
    const volume = Math.max(0, Math.min(.5, Number(getVolume()) || 0));
    if (!volume || destroyed || (!invitation && host?.hidden)) return false;
    try {
      if (!await prepare()) return false;
      if (material === 'paper') await loading;
      if (material === 'leather') await loadingLeather;
      if (material === 'leather' && direction === 'backward') await loadingImpact;
      if (animation) await animation.ready;
      if (destroyed || requests.get(material) !== request || (!invitation && host?.hidden)) return false;
      if (material === 'paper' && !recordedPaper) return false;
      if (material === 'leather' && !recordedLeather && !(direction === 'backward' && recordedImpact)) return false;
      const measured = animation?.effect?.getComputedTiming().duration;
      if (typeof measured === 'number' && measured > 0) duration = measured;
      const seconds = duration / 1000;
      const key = `${material}:${direction}:${duration}:${easing.join(',')}:${!!recordedImpact}:${!!recordedLeather}`;
      let buffer = buffers.get(key);
      if (!buffer) {
        const data = renderBookFoley({ sampleRate: context.sampleRate, duration: seconds, material, direction, paper: recordedPaper, leather: recordedLeather, impact: recordedImpact, easing });
        buffer = context.createBuffer(1, data.length, context.sampleRate);
        buffer.getChannelData(0).set(data);
        buffers.set(key, buffer);
        if (buffers.size > 8) buffers.delete(buffers.keys().next().value);
      }
      // Account for decoding, snapshot work, frame scheduling and the audio
      // device's output latency. Late data seeks to the motion, never replays it.
      const elapsed = animation ? Number(animation.currentTime) / 1000 : (performance.now() - requestedAt) / 1000;
      const lead = .005, latency = Math.max(0, (context.baseLatency || 0) + (context.outputLatency || 0));
      const offset = Math.max(0, elapsed + lead + latency);
      if (offset >= seconds || animation?.playState === 'idle' || context.state !== 'running') return false;
      const source = context.createBufferSource(), gain = context.createGain();
      source.buffer = buffer;
      const start = context.currentTime + lead;
      gain.gain.setValueAtTime(0, start);
      gain.gain.linearRampToValueAtTime(invitation ? Math.min(.1, volume * .6) : volume, start + .006);
      source.connect(gain); gain.connect(context.destination);
      const current = { source, gain, invitation };
      active.set(material, current);
      source.onended = () => {
        if (active.get(material) === current) active.delete(material);
        source.disconnect(); gain.disconnect();
      };
      source.start(start, offset);
      return true;
    } catch { return false; }
  }

  const warm = event => { if (event.isTrusted && event.target.closest?.('.diary-shell')) void prepare(); };
  const quiet = () => { for (const kind of ['paper', 'leather']) if (!active.get(kind)?.invitation) stop(kind); };
  const visibility = () => { if (host.hidden) quiet(); };
  host?.addEventListener('pointerdown', warm, true);
  host?.addEventListener('keydown', warm, true);
  host?.addEventListener('visibilitychange', visibility);
  globalThis.window?.addEventListener('blur', quiet);
  return {
    prepare, play, stop,
    destroy() {
      destroyed = true; stop(); buffers.clear();
      host?.removeEventListener('pointerdown', warm, true);
      host?.removeEventListener('keydown', warm, true);
      host?.removeEventListener('visibilitychange', visibility);
      globalThis.window?.removeEventListener('blur', quiet);
      void context?.close().catch(() => {});
    },
  };
}
