/** Browser-only diary helpers. Nothing starts at module load. */

const SOUNDSCAPES = {
  rain: {},
  forest: { notes: [196, 246.94, 293.66, 392, 493.88], interval: 3400, decay: 6, level: 0.075 },
  piano: { notes: [261.63, 329.63, 392, 523.25, 440, 392, 329.63, 293.66], interval: 1100, decay: 4, level: 0.15 },
};

function notify(callback, value) {
  if (typeof callback !== 'function') return;
  try { callback(value); } catch { /* Consumers own rendering errors. */ }
}

function disconnect(node) {
  try { node.disconnect(); } catch { /* Already disconnected. */ }
}

/** A muted roof heard from inside a cabin, with no repeating melody or sharp hiss.
 * Returns PCM so the same texture can also be rendered and checked offline.
 */
export function synthesizeCabinRain(sampleRate, { duration = 29, seed = Math.floor(Math.random() * 0xffffffff) } = {}) {
  const length = Math.round(sampleRate * duration);
  const overlap = Math.round(sampleRate * 0.8);
  const size = length + overlap;
  const channels = [new Float32Array(size), new Float32Array(size)];
  let state = seed >>> 0 || 1;
  const random = () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return (state >>> 0) / 4294967296;
  };
  const coefficient = frequency => 1 - Math.exp(-2 * Math.PI * frequency / sampleRate);
  const brightCutoff = coefficient(2350);
  const middleCutoff = coefficient(520);
  const rumbleCutoff = coefficient(110);
  const sharedCutoff = coefficient(1250);
  let shared = 0;
  const low = [0, 0];
  const middle = [0, 0];
  const rumble = [0, 0];

  // A diffuse bed remains underneath the individual roof drops. Slow, shallow
  // changes in density avoid the static quality of a single filtered noise.
  for (let i = 0; i < size; i += 1) {
    shared += sharedCutoff * (random() * 2 - 1 - shared);
    const time = i / sampleRate;
    const breeze = 0.91 + 0.055 * Math.sin(time * 0.31) + 0.035 * Math.sin(time * 0.83 + 1.4);
    for (let channel = 0; channel < 2; channel += 1) {
      const white = random() * 2 - 1;
      low[channel] += brightCutoff * (white - low[channel]);
      middle[channel] += middleCutoff * (white - middle[channel]);
      rumble[channel] += rumbleCutoff * (white - rumble[channel]);
      channels[channel][i] = breeze * (
        0.26 * (low[channel] - middle[channel])
        + 0.20 * (middle[channel] - rumble[channel])
        + 0.10 * shared
      );
    }
  }

  // Stochastic, rounded impacts: many fine drops and occasional fuller wooden
  // roof taps. Each has its own colour, decay and position, never a fixed beat.
  let arrival = 0;
  while (arrival < duration + 0.8) {
    arrival += -Math.log(Math.max(0.000001, random())) / (73 + 9 * Math.sin(arrival * 0.37));
    const start = Math.floor(arrival * sampleRate);
    const fullDrop = random() < 0.075;
    const decay = fullDrop ? 0.035 + random() * 0.028 : 0.009 + random() * 0.019;
    const attack = 0.0015 + random() * 0.0025;
    const tapLength = Math.ceil(decay * 5 * sampleRate);
    const cutoff = coefficient(fullDrop ? 650 + random() * 600 : 1150 + random() * 1600);
    const bodyFrequency = 210 + random() * 490;
    const level = (fullDrop ? 0.18 : 0.065) * (0.35 + random() * 0.65);
    const pan = random() * 1.6 - 0.8;
    const left = Math.cos((pan + 1) * Math.PI / 4);
    const right = Math.sin((pan + 1) * Math.PI / 4);
    let filtered = 0;
    let bass = 0;
    for (let j = 0; j < tapLength && start + j < size; j += 1) {
      const time = j / sampleRate;
      filtered += cutoff * (random() * 2 - 1 - filtered);
      bass += rumbleCutoff * (filtered - bass);
      const envelope = (1 - Math.exp(-time / attack)) * Math.exp(-time / decay);
      const body = fullDrop ? 0.28 * Math.sin(2 * Math.PI * bodyFrequency * time) * Math.exp(-time / 0.019) : 0;
      const tap = level * (envelope * (filtered - bass) + body);
      channels[0][start + j] += tap * left;
      channels[1][start + j] += tap * right;
    }
  }

  const output = [new Float32Array(length), new Float32Array(length)];
  const reflectionA = Math.round(sampleRate * 0.017);
  const reflectionB = Math.round(sampleRate * 0.041);
  const roomCutoff = coefficient(1800);
  const ceilingCutoff = coefficient(3400);
  const dcCutoff = coefficient(35);
  let energy = 0;
  let peak = 0;
  for (let channel = 0; channel < 2; channel += 1) {
    const samples = channels[channel];
    const opposite = channels[1 - channel];
    let room = 0;
    let sheltered = 0;
    let softened = 0;
    let dc = 0;
    for (let i = 0; i < size; i += 1) {
      // Short, dark reflections suggest a sheltered interior, without an echo.
      const reflected = (i >= reflectionA ? samples[i - reflectionA] * 0.12 : 0)
        + (i >= reflectionB ? opposite[i - reflectionB] * 0.075 : 0);
      room += roomCutoff * (reflected - room);
      sheltered += ceilingCutoff * (samples[i] + room - sheltered);
      softened += ceilingCutoff * (sheltered - softened);
      const value = softened;
      dc += dcCutoff * (value - dc);
      samples[i] = value - dc;
    }
    for (let i = 0; i < length; i += 1) {
      // Use the warmed-up head. A smooth overlap at the tail joins back to it
      // with matching slope; both channels share the same crossfade envelope.
      let value = samples[overlap + i];
      if (i >= length - overlap) {
        const progress = (i - (length - overlap)) / overlap;
        const mix = 0.5 - 0.5 * Math.cos(Math.PI * progress);
        value = value * (1 - mix) + samples[i - (length - overlap)] * mix;
      }
      output[channel][i] = value;
      energy += value * value;
      peak = Math.max(peak, Math.abs(value));
    }
  }
  const rms = Math.sqrt(energy / (length * 2));
  const gain = Math.min(0.14 / Math.max(rms, 0.0001), 0.68 / Math.max(peak, 0.0001));
  for (const samples of output) {
    for (let i = 0; i < length; i += 1) samples[i] *= gain;
  }
  return output;
}

/** Entirely synthesized. Call play from a user action; no network or storage. */
export function createSoundscape({ onState } = {}) {
  let session = null;
  let generation = 0;
  let volume = 0.35;
  let preset = 'rain';
  let playing = false;
  let destroyed = false;

  function publish() {
    notify(onState, { playing, preset });
  }

  function track(current, node, isSource = false) {
    current.nodes.add(node);
    if (isSource) current.sources.add(node);
    return node;
  }

  function tone(current, frequency, start, duration, level, bird = false) {
    if (!current.alive) return;
    const oscillator = track(current, current.context.createOscillator(), true);
    const envelope = track(current, current.context.createGain());
    if (bird) {
      oscillator.type = 'sine';
      oscillator.frequency.setValueAtTime(frequency, start);
      oscillator.frequency.exponentialRampToValueAtTime(frequency * 1.38, start + duration * 0.35);
      oscillator.frequency.exponentialRampToValueAtTime(frequency * 0.88, start + duration);
    } else {
      oscillator.setPeriodicWave(current.pianoWave);
      oscillator.frequency.setValueAtTime(frequency, start);
    }
    envelope.gain.setValueAtTime(0, start);
    envelope.gain.linearRampToValueAtTime(level, start + (bird ? 0.035 : 0.012));
    envelope.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    oscillator.connect(envelope);
    envelope.connect(current.master);
    oscillator.onended = () => {
      current.sources.delete(oscillator);
      current.nodes.delete(oscillator);
      current.nodes.delete(envelope);
      disconnect(oscillator);
      disconnect(envelope);
    };
    oscillator.start(start);
    oscillator.stop(start + duration + 0.05);
  }

  function addAtmosphere(current, selectedPreset) {
    if (selectedPreset === 'piano') return;
    const context = current.context;
    if (selectedPreset === 'rain') {
      const channels = synthesizeCabinRain(context.sampleRate);
      const buffer = context.createBuffer(2, channels[0].length, context.sampleRate);
      for (let channel = 0; channel < 2; channel += 1) buffer.getChannelData(channel).set(channels[channel]);
      const rain = track(current, context.createBufferSource(), true);
      rain.buffer = buffer;
      rain.loop = true;
      rain.connect(current.master);
      rain.start();
      return;
    }
    const buffer = context.createBuffer(1, context.sampleRate * 3, context.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i += 1) data[i] = Math.random() * 2 - 1;
    // Blend the tail into the beginning to soften the repeating noise boundary.
    const blend = Math.min(1024, Math.floor(data.length / 8));
    for (let i = 0; i < blend; i += 1) {
      const amount = i / blend;
      data[data.length - blend + i] = data[data.length - blend + i] * (1 - amount) + data[i] * amount;
    }
    const noise = track(current, context.createBufferSource(), true);
    const filter = track(current, context.createBiquadFilter());
    const level = track(current, context.createGain());
    noise.buffer = buffer;
    noise.loop = true;
    filter.type = 'lowpass';
    filter.frequency.value = 480;
    filter.Q.value = 0.5;
    level.gain.value = 0.065;
    noise.connect(filter);
    filter.connect(level);
    level.connect(current.master);
    noise.start();
  }

  function schedule(current, selectedPreset) {
    if (selectedPreset === 'rain') return;
    const config = SOUNDSCAPES[selectedPreset];
    let step = 0;
    const tick = () => {
      if (!current.alive || session !== current) return;
      if (current.context.state !== 'running') {
        void stop();
        return;
      }
      try {
        const time = current.context.currentTime + 0.025;
        const index = selectedPreset === 'piano' ? step % config.notes.length : Math.floor(Math.random() * config.notes.length);
        tone(current, config.notes[index], time, config.decay, config.level);
        if (selectedPreset === 'piano' && step % 4 === 0) {
          tone(current, config.notes[0] / 2, time, 5.2, 0.105);
        }
        if (selectedPreset === 'forest' && step % 2 === 0) {
          const frequency = 1500 + Math.random() * 650;
          tone(current, frequency, time + 0.6, 0.28, 0.035, true);
          tone(current, frequency * 1.12, time + 1.02, 0.2, 0.025, true);
        }
        step += 1;
        current.timer = setTimeout(tick, config.interval);
      } catch {
        void stop();
      }
    };
    tick();
  }

  async function release(current) {
    if (!current) return;
    current.alive = false;
    clearTimeout(current.timer);
    current.context.onstatechange = null;
    if (current.context.state === 'running') {
      const now = current.context.currentTime;
      const parameter = current.master.gain;
      if (parameter.cancelAndHoldAtTime) parameter.cancelAndHoldAtTime(now);
      else parameter.cancelScheduledValues(now);
      parameter.setTargetAtTime(0, now, 0.035);
      // Let the fade reach silence before stopping sources or closing context.
      await new Promise(resolve => setTimeout(resolve, 180));
    }
    for (const source of current.sources) {
      source.onended = null;
      try { source.stop(); } catch { /* It may have already ended. */ }
    }
    for (const node of current.nodes) disconnect(node);
    current.sources.clear();
    current.nodes.clear();
    if (current.context.state !== 'closed') {
      try { await current.context.close(); } catch { /* Closing is best effort. */ }
    }
  }

  async function play(requestedPreset = 'rain') {
    if (destroyed) return false;
    const selectedPreset = Object.hasOwn(SOUNDSCAPES, requestedPreset) ? requestedPreset : 'rain';
    if (session?.alive && playing && selectedPreset === preset) return true;
    const ticket = ++generation;
    const previous = session;
    session = null;
    playing = false;
    // Do not await closure: resume must run during the user's click activation.
    void release(previous);
    preset = selectedPreset;
    const AudioContextClass = globalThis.AudioContext || globalThis.webkitAudioContext;
    if (!AudioContextClass) {
      publish();
      throw new Error('Seu navegador não oferece suporte à trilha sonora.');
    }
    let current;
    try {
      const context = new AudioContextClass();
      current = { context, alive: true, timer: null, nodes: new Set(), sources: new Set() };
      session = current;
      current.master = track(current, context.createGain());
      current.master.gain.value = 0;
      const compressor = track(current, context.createDynamicsCompressor());
      compressor.threshold.value = -16;
      compressor.knee.value = 20;
      compressor.ratio.value = 4;
      compressor.attack.value = 0.02;
      compressor.release.value = 0.25;
      current.master.connect(compressor);
      compressor.connect(context.destination);
      current.pianoWave = context.createPeriodicWave(
        new Float32Array([0, 0, 0, 0, 0]),
        new Float32Array([0, 1, 0.38, 0.14, 0.06]),
      );
      await context.resume();
      if (destroyed || ticket !== generation || session !== current) {
        await release(current);
        return false;
      }
      if (context.state !== 'running') throw new Error('AudioContext is suspended');
      addAtmosphere(current, selectedPreset);
      current.master.gain.setValueAtTime(0, context.currentTime);
      current.master.gain.linearRampToValueAtTime(volume, context.currentTime + 1.2);
      playing = true;
      context.onstatechange = () => {
        if (session !== current || !current.alive) return;
        if (context.state !== 'running') {
          void stop();
        }
      };
      schedule(current, selectedPreset);
      publish();
      return playing;
    } catch (error) {
      await release(current);
      if (ticket !== generation || destroyed) return false;
      session = null;
      playing = false;
      publish();
      throw new Error('Não foi possível iniciar a trilha sonora. Tente tocar novamente.', { cause: error });
    }
  }

  async function stop() {
    generation += 1;
    const previous = session;
    session = null;
    playing = false;
    publish();
    await release(previous);
  }

  async function setVolume(value) {
    const next = Number(value);
    if (!Number.isFinite(next)) return false;
    volume = Math.max(0, Math.min(1, next));
    if (session?.alive && session.context.state !== 'closed') {
      const parameter = session.master.gain;
      const now = session.context.currentTime;
      if (parameter.cancelAndHoldAtTime) parameter.cancelAndHoldAtTime(now);
      else parameter.cancelScheduledValues(now);
      parameter.setTargetAtTime(volume, now, 0.035);
    }
    return true;
  }

  return {
    play,
    stop,
    setVolume,
    destroy() {
      destroyed = true;
      return stop();
    },
    get playing() { return playing; },
  };
}

const DICTATION_ERRORS = {
  'not-allowed': 'O acesso ao microfone não foi permitido. Autorize o microfone nas configurações do navegador para ditar.',
  'service-not-allowed': 'O reconhecimento de voz não está disponível neste navegador. Você pode escrever no diário.',
  'audio-capture': 'Não foi possível acessar o microfone. Verifique se ele está conectado e disponível.',
  'network': 'A transcrição ficou sem conexão. Verifique sua internet e tente novamente.',
  'no-speech': 'Não foi possível ouvir sua voz. Toque no microfone e tente novamente.',
  'language-not-supported': 'O reconhecimento em português não está disponível neste navegador.',
};

/** The browser transcribes speech; this module never records or stores audio. */
export function createDictation({ onText, onState, onError } = {}) {
  const Recognition = globalThis.SpeechRecognition || globalThis.webkitSpeechRecognition;
  const supported = typeof Recognition === 'function';
  let recognition = null;
  let listening = false;
  let starting = false;
  let destroyed = false;

  function updateListening(value) {
    if (listening === value) return;
    listening = value;
    notify(onState, value);
  }

  function detach(instance) {
    instance.onstart = null;
    instance.onend = null;
    instance.onerror = null;
    instance.onresult = null;
  }

  function start() {
    if (destroyed || recognition || listening || starting) return false;
    if (!supported) {
      notify(onError, 'Seu navegador não oferece reconhecimento de voz. Você pode escrever no diário.');
      return false;
    }
    let instance;
    try {
      instance = new Recognition();
      recognition = instance;
      starting = true;
      instance.lang = 'pt-BR';
      instance.interimResults = false;
      instance.continuous = true;
      instance.onstart = () => {
        if (recognition !== instance || destroyed) return;
        starting = false;
        updateListening(true);
      };
      instance.onresult = (event) => {
        if (recognition !== instance || destroyed) return;
        const parts = [];
        for (let i = event.resultIndex ?? 0; i < event.results.length; i += 1) {
          if (event.results[i].isFinal) {
            const transcript = event.results[i][0]?.transcript?.trim();
            if (transcript) parts.push(transcript);
          }
        }
        if (parts.length) notify(onText, parts.join(' '));
      };
      instance.onerror = (event) => {
        if (recognition !== instance || destroyed) return;
        recognition = null;
        starting = false;
        detach(instance);
        try { instance.abort(); } catch { /* Some browsers already stopped. */ }
        updateListening(false);
        if (event.error !== 'aborted') {
          notify(onError, DICTATION_ERRORS[event.error] || 'A transcrição foi interrompida. Toque no microfone para tentar novamente.');
        }
      };
      instance.onend = () => {
        if (recognition !== instance) return;
        recognition = null;
        starting = false;
        detach(instance);
        updateListening(false);
      };
      instance.start();
      return true;
    } catch {
      if (instance) {
        detach(instance);
        try { instance.abort(); } catch { /* No active capture to abort. */ }
      }
      recognition = null;
      starting = false;
      updateListening(false);
      notify(onError, 'Não foi possível iniciar o microfone. Verifique a permissão do navegador e tente novamente.');
      return false;
    }
  }

  function stop() {
    const instance = recognition;
    if (!instance) return false;
    starting = false;
    // Preserve final result/end handlers while the browser stops capture.
    instance.onstart = null;
    updateListening(false);
    try {
      instance.stop();
      return true;
    } catch {
      recognition = null;
      detach(instance);
      try { instance.abort(); } catch { /* Already stopped. */ }
      return false;
    }
  }

  return {
    supported,
    start,
    stop,
    destroy() {
      destroyed = true;
      starting = false;
      const instance = recognition;
      recognition = null;
      if (instance) {
        detach(instance);
        try { instance.abort(); } catch { /* Already stopped. */ }
      }
      updateListening(false);
    },
    get listening() { return listening; },
  };
}
