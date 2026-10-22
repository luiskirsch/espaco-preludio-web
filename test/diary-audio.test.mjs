import test, { afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { createDictation, createSoundscape as createRuntimeSoundscape } from '../app/diary-audio.js';

function createSoundscape(options = {}) {
  const recording = async context => context.createBuffer(2, context.sampleRate * 3, context.sampleRate);
  return createRuntimeSoundscape({ rainLoader: recording, forestLoader: recording, pianoLoader: recording, ...options });
}

const originalGlobals = new Map(['AudioContext', 'webkitAudioContext', 'SpeechRecognition', 'webkitSpeechRecognition'].map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
afterEach(() => {
  for (const [key, descriptor] of originalGlobals) {
    if (descriptor) Object.defineProperty(globalThis, key, descriptor);
    else delete globalThis[key];
  }
});

function parameter(value = 0) {
  return { value, events: [], setValueAtTime(v, time) { this.events.push(['set', v, time]); this.value = v; }, linearRampToValueAtTime(v, time) { this.events.push(['ramp', v, time]); this.value = v; }, exponentialRampToValueAtTime(v) { this.value = v; }, setTargetAtTime(v, time, constant) { this.events.push(['target', v, time, constant]); this.value = v; }, cancelScheduledValues() {} };
}

class FakeNode {
  constructor(kind) {
    this.kind = kind;
    this.gain = parameter();
    this.frequency = parameter();
    this.Q = parameter();
    this.threshold = parameter();
    this.knee = parameter();
    this.ratio = parameter();
    this.attack = parameter();
    this.release = parameter();
  }
  connect() {}
  disconnect() { this.disconnected = true; }
  start() { this.started = true; }
  stop() { this.stopped = true; }
  setPeriodicWave() {}
}

class FakeAudioContext {
  static instances = [];
  constructor() {
    this.nodes = [];
    this.currentTime = 0;
    this.sampleRate = 8000;
    this.state = 'suspended';
    this.destination = {};
    FakeAudioContext.instances.push(this);
  }
  node(kind) { const node = new FakeNode(kind); this.nodes.push(node); return node; }
  createGain() { return this.node('gain'); }
  createDynamicsCompressor() { return this.node('compressor'); }
  createOscillator() { return this.node('oscillator'); }
  createBiquadFilter() { return this.node('filter'); }
  createBufferSource() { return this.node('buffer'); }
  createBuffer(numberOfChannels, length) {
    const channels = Array.from({ length: numberOfChannels }, () => new Float32Array(length));
    return { numberOfChannels, length, getChannelData: channel => channels[channel] };
  }
  createPeriodicWave() { return {}; }
  async resume() { this.state = 'running'; }
  async close() { this.state = 'closed'; this.closed = true; }
}

class FakeRecognition {
  static instances = [];
  constructor() { FakeRecognition.instances.push(this); }
  start() { this.started = true; }
  stop() { this.stopped = true; }
  abort() { this.aborted = true; }
}

test('soundscapes stay idle until explicitly played; switching and destruction release every source', async () => {
  globalThis.AudioContext = FakeAudioContext;
  const states = [];
  const before = FakeAudioContext.instances.length;
  const audio = createSoundscape({ onState: state => states.push(state) });
  assert.equal(FakeAudioContext.instances.length, before);
  assert.equal(audio.playing, false);
  await audio.setVolume(0.2);
  assert.equal(await audio.play('rain'), true);
  const rain = FakeAudioContext.instances.at(-1);
  assert.equal(rain.nodes[0].gain.value, 0.2);
  const rainSource = rain.nodes.find(node => node.kind === 'buffer');
  assert.equal(rainSource.buffer.numberOfChannels, 2);
  assert.equal(rainSource.loop, true);
  assert.ok(rain.nodes.some(node => node.kind === 'oscillator'), 'Recorded rain keeps the quiet piano accompaniment');
  assert.deepEqual(rain.nodes[0].gain.events.at(-1), ['ramp', 0.2, 1.2]);
  assert.equal(await audio.play('rain'), true);
  assert.equal(FakeAudioContext.instances.length, before + 1);
  await audio.play('forest');
  const forest = FakeAudioContext.instances.at(-1);
  assert.deepEqual(rain.nodes[0].gain.events.at(-1), ['target', 0, 0, 0.035]);
  await new Promise(resolve => setTimeout(resolve, 200));
  assert.equal(rain.closed, true);
  const forestSource = forest.nodes.find(node => node.kind === 'buffer');
  assert.equal(forestSource.buffer.numberOfChannels, 2);
  assert.equal(forestSource.loop, true);
  assert.equal(forest.nodes.some(node => node.kind === 'oscillator'), false, 'No synthetic birds or random notes');
  await audio.play('piano');
  const piano = FakeAudioContext.instances.at(-1);
  await new Promise(resolve => setTimeout(resolve, 200));
  assert.equal(forest.closed, true);
  const pianoSource = piano.nodes.find(node => node.kind === 'buffer');
  assert.equal(pianoSource.buffer.numberOfChannels, 2);
  assert.equal(pianoSource.loop, true);
  assert.equal(piano.nodes.some(node => node.kind === 'oscillator'), false, 'Piano plays the complete composition');
  await audio.setVolume(2);
  assert.equal(piano.nodes[0].gain.value, 1);
  await audio.destroy();
  assert.equal(audio.playing, false);
  assert.equal(piano.closed, true);
  for (const context of [rain, forest, piano]) {
    assert.ok(context.nodes.every(node => node.disconnected));
    assert.ok(context.nodes.filter(node => ['oscillator', 'buffer'].includes(node.kind)).every(node => node.stopped));
  }
  assert.equal(await audio.play(), false);
  assert.deepEqual(states.at(-1), { playing: false, preset: 'piano' });
});

test('stop wins when audio activation is still pending', async () => {
  let activate;
  class DelayedContext extends FakeAudioContext {
    resume() { return new Promise(resolve => { activate = () => { this.state = 'running'; resolve(); }; }); }
  }
  globalThis.AudioContext = DelayedContext;
  const audio = createSoundscape();
  const pending = audio.play();
  const context = FakeAudioContext.instances.at(-1);
  await audio.stop();
  activate();
  assert.equal(await pending, false);
  assert.equal(audio.playing, false);
  assert.equal(context.state, 'closed');
  assert.equal(context.nodes.some(node => node.kind === 'buffer'), false);
});

test('device suspension closes the context and updates playback state', async () => {
  globalThis.AudioContext = FakeAudioContext;
  const audio = createSoundscape();
  await audio.play();
  const context = FakeAudioContext.instances.at(-1);
  context.state = 'suspended';
  context.onstatechange();
  assert.equal(audio.playing, false);
  assert.equal(context.closed, true);
});

test('a failed rain download stops cleanly without falling back to generated hiss', async () => {
  globalThis.AudioContext = FakeAudioContext;
  const audio = createSoundscape({ rainLoader: async () => { throw new Error('Recording unavailable'); } });
  await assert.rejects(audio.play('rain'), /Não foi possível iniciar/);
  assert.equal(audio.playing, false);
  const context = FakeAudioContext.instances.at(-1);
  assert.equal(context.closed, true);
  assert.equal(context.nodes.some(node => node.kind === 'buffer' || node.kind === 'oscillator'), false);
});

test('stopping during a rain download cancels it and ignores its late result', async () => {
  globalThis.AudioContext = FakeAudioContext;
  let finishDownload, downloadSignal;
  const audio = createSoundscape({ rainLoader: (context, signal) => {
    downloadSignal = signal;
    return new Promise(resolve => { finishDownload = () => resolve(context.createBuffer(2, 2000, 8000)); });
  } });
  const pending = audio.play('rain');
  for (let i = 0; !finishDownload && i < 5; i++) await Promise.resolve();
  assert.equal(typeof finishDownload, 'function');
  await audio.stop();
  assert.equal(downloadSignal.aborted, true);
  finishDownload();
  assert.equal(await pending, false);
  assert.equal(audio.playing, false);
  const context = FakeAudioContext.instances.at(-1);
  assert.equal(context.closed, true);
  assert.equal(context.nodes.some(node => node.kind === 'buffer' || node.kind === 'oscillator'), false);
});

for (const preset of ['forest', 'piano']) {
  test(`${preset} releases a failed download and allows a fresh play`, async () => {
    globalThis.AudioContext = FakeAudioContext;
    let attempts = 0;
    const audio = createSoundscape({ [`${preset}Loader`]: async context => {
      if (++attempts === 1) throw new Error('Recording unavailable');
      return context.createBuffer(2, 2000, 8000);
    } });
    await assert.rejects(audio.play(preset), /Não foi possível iniciar/);
    const failed = FakeAudioContext.instances.at(-1);
    assert.equal(failed.closed, true);
    assert.equal(failed.nodes.some(node => node.kind === 'buffer' || node.kind === 'oscillator'), false);
    assert.equal(await audio.play(preset), true);
    await audio.destroy();
  });

  test(`switching away from a loading ${preset} cannot restart it later`, async () => {
    globalThis.AudioContext = FakeAudioContext;
    let finishDownload, downloadSignal;
    const audio = createSoundscape({ [`${preset}Loader`]: (context, signal) => {
      downloadSignal = signal;
      return new Promise(resolve => { finishDownload = () => resolve(context.createBuffer(2, 2000, 8000)); });
    } });
    const pending = audio.play(preset);
    for (let i = 0; !finishDownload && i < 5; i++) await Promise.resolve();
    const abandoned = FakeAudioContext.instances.at(-1);
    assert.equal(await audio.play('rain'), true);
    assert.equal(downloadSignal.aborted, true);
    finishDownload();
    assert.equal(await pending, false);
    assert.equal(abandoned.closed, true);
    assert.equal(abandoned.nodes.some(node => node.kind === 'buffer' || node.kind === 'oscillator'), false);
    assert.equal(audio.playing, true, 'The new selection keeps playing');
    await audio.destroy();
  });
}

test('unsupported speech recognition reports a useful message without throwing', () => {
  delete globalThis.SpeechRecognition;
  delete globalThis.webkitSpeechRecognition;
  const errors = [];
  const dictation = createDictation({ onError: message => errors.push(message) });
  assert.equal(dictation.supported, false);
  assert.equal(dictation.start(), false);
  assert.match(errors[0], /escrever no diário/);
  dictation.destroy();
});

test('dictation emits final Portuguese transcripts, preserves final results when stopped, and releases the microphone', () => {
  globalThis.SpeechRecognition = FakeRecognition;
  const texts = [];
  const states = [];
  const dictation = createDictation({ onText: text => texts.push(text), onState: state => states.push(state) });
  assert.equal(dictation.start(), true);
  const first = FakeRecognition.instances.at(-1);
  assert.equal(first.lang, 'pt-BR');
  assert.equal(first.continuous, true);
  assert.equal(first.interimResults, false);
  assert.equal(dictation.listening, false);
  first.onstart();
  assert.equal(dictation.listening, true);
  const finalResult = Object.assign([{ transcript: ' Hoje me senti bem. ' }], { isFinal: true });
  const interimResult = Object.assign([{ transcript: 'ignore' }], { isFinal: false });
  first.onresult({ resultIndex: 0, results: [finalResult, interimResult] });
  assert.deepEqual(texts, ['Hoje me senti bem.']);
  assert.equal(dictation.stop(), true);
  assert.equal(first.stopped, true);
  assert.equal(dictation.listening, false);
  assert.equal(dictation.start(), false);
  first.onresult({ resultIndex: 0, results: [finalResult] });
  assert.equal(texts.length, 2);
  first.onend();
  assert.equal(dictation.start(), true);
  const second = FakeRecognition.instances.at(-1);
  second.onstart();
  dictation.destroy();
  assert.equal(second.aborted, true);
  assert.equal(second.onresult, null);
  assert.equal(dictation.listening, false);
  assert.equal(dictation.start(), false);
  assert.deepEqual(states, [true, false, true, false]);
});

test('permission failures clear listening state and allow a fresh attempt', () => {
  globalThis.webkitSpeechRecognition = FakeRecognition;
  delete globalThis.SpeechRecognition;
  const errors = [];
  const dictation = createDictation({ onError: message => errors.push(message) });
  dictation.start();
  const instance = FakeRecognition.instances.at(-1);
  instance.onstart();
  instance.onerror({ error: 'not-allowed' });
  assert.equal(instance.aborted, true);
  assert.equal(dictation.listening, false);
  assert.match(errors[0], /não foi permitido/);
  assert.equal(dictation.start(), true);
  dictation.destroy();
});
