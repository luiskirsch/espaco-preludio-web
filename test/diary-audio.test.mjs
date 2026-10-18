import test, { afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { createDictation, createSoundscape } from '../app/diary-audio.js';

const originalGlobals = new Map(['AudioContext', 'webkitAudioContext', 'SpeechRecognition', 'webkitSpeechRecognition'].map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
afterEach(() => {
  for (const [key, descriptor] of originalGlobals) {
    if (descriptor) Object.defineProperty(globalThis, key, descriptor);
    else delete globalThis[key];
  }
});

function parameter(value = 0) {
  return { value, setValueAtTime(v) { this.value = v; }, linearRampToValueAtTime(v) { this.value = v; }, exponentialRampToValueAtTime(v) { this.value = v; }, setTargetAtTime(v) { this.value = v; }, cancelScheduledValues() {} };
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
  createBuffer(channels, length) { return { getChannelData: () => new Float32Array(length) }; }
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
  assert.equal(rain.nodes.find(node => node.kind === 'filter').type, 'highpass');
  assert.equal(await audio.play('rain'), true);
  assert.equal(FakeAudioContext.instances.length, before + 1);
  await audio.play('forest');
  const forest = FakeAudioContext.instances.at(-1);
  assert.equal(rain.closed, true);
  assert.equal(forest.nodes.find(node => node.kind === 'filter').type, 'lowpass');
  assert.ok(forest.nodes.filter(node => node.kind === 'oscillator').length >= 3);
  await audio.play('piano');
  const piano = FakeAudioContext.instances.at(-1);
  assert.equal(forest.closed, true);
  assert.equal(piano.nodes.some(node => node.kind === 'buffer'), false);
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
