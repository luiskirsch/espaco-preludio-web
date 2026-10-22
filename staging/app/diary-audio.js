/** Browser-only diary helpers. Nothing starts at module load. */
import { loadCabinRain } from './diary-rain.js?h=28fc06031d';
import { loadForest, loadPiano } from './diary-tracks.js?h=15ae23e42d';

const SOUNDSCAPES = {
  rain: { notes: [261.63, 329.63, 392, 523.25, 440, 392, 329.63, 293.66], interval: 2600, decay: 5.8, level: .038 },
  forest: {},
  piano: {},
};

function notify(callback, value) {
  if (typeof callback !== 'function') return;
  try { callback(value); } catch { /* Consumers own rendering errors. */ }
}

function disconnect(node) {
  try { node.disconnect(); } catch { /* Already disconnected. */ }
}

/** Nothing loads or plays before a click. Every preset shares the same playback lifecycle. */
export function createSoundscape({ onState, rainLoader = loadCabinRain, forestLoader = loadForest, pianoLoader = loadPiano } = {}) {
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

  function tone(current, frequency, start, duration, level) {
    if (!current.alive) return;
    const oscillator = track(current, current.context.createOscillator(), true);
    const envelope = track(current, current.context.createGain());
    oscillator.setPeriodicWave(current.pianoWave);
    oscillator.frequency.setValueAtTime(frequency, start);
    envelope.gain.setValueAtTime(0, start);
    envelope.gain.linearRampToValueAtTime(level, start + 0.012);
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

  async function addAtmosphere(current, selectedPreset) {
    const context = current.context;
    const loader = { rain: rainLoader, forest: forestLoader, piano: pianoLoader }[selectedPreset];
    const buffer = await loader(context, current.loading.signal);
    if (!current.alive) return;
    const recording = track(current, context.createBufferSource(), true);
    recording.buffer = buffer;
    recording.loop = true;
    recording.connect(current.master);
    recording.start();
  }

  function schedule(current, selectedPreset) {
    if (selectedPreset !== 'rain') return;
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
        const index = step % config.notes.length;
        tone(current, config.notes[index], time, config.decay, config.level);
        if (step % 4 === 0) {
          tone(current, config.notes[0] / 2, time, 6, .022);
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
    current.loading.abort();
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
      current = { context, alive: true, timer: null, loading: new AbortController(), nodes: new Set(), sources: new Set() };
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
      if (selectedPreset === 'rain') {
        current.pianoWave = context.createPeriodicWave(
          new Float32Array([0, 0, 0, 0, 0]),
          new Float32Array([0, 1, 0.38, 0.14, 0.06]),
        );
      }
      await context.resume();
      if (destroyed || ticket !== generation || session !== current) {
        await release(current);
        return false;
      }
      if (context.state !== 'running') throw new Error('AudioContext is suspended');
      await addAtmosphere(current, selectedPreset);
      if (destroyed || ticket !== generation || session !== current || !current.alive) {
        await release(current);
        return false;
      }
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
