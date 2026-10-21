import test, { afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { createBookFoley, renderBookFoley } from '../app/diary-foley.js';

const originalContext = Object.getOwnPropertyDescriptor(globalThis, 'AudioContext');
const originalFetch = globalThis.fetch;
afterEach(() => {
  if (originalContext) Object.defineProperty(globalThis, 'AudioContext', originalContext);
  else delete globalThis.AudioContext;
  globalThis.fetch = originalFetch;
  FakeContext.instances.length = 0;
});

class FakeContext {
  static instances = [];
  constructor() {
    FakeContext.instances.push(this);
    this.sampleRate = 8000; this.currentTime = 10; this.baseLatency = .01; this.outputLatency = .02;
    this.state = 'suspended'; this.sources = []; this.destination = {};
  }
  async resume() { this.state = 'running'; }
  async close() { this.state = 'closed'; }
  createBuffer(channels, length, rate) {
    const data = new Float32Array(length);
    return { duration: length / rate, getChannelData: () => data };
  }
  async decodeAudioData(bytes) {
    const impact = new Uint8Array(bytes)[0] === 3;
    const length = impact ? 1320 : 4800;
    const buffer = this.createBuffer(1, length, this.sampleRate);
    buffer.getChannelData(0).set(Array.from({ length }, (_, i) => impact
      ? i < 256 ? 0 : Math.sin((i - 256) * .1) * Math.exp(-(i - 256) / 80)
      : Math.sin(i * 2.3) * .2));
    return buffer;
  }
  createGain() { return { gain: { value: 0, setValueAtTime() {}, linearRampToValueAtTime() {}, cancelScheduledValues() {}, setTargetAtTime() {} }, connect() {}, disconnect() {} }; }
  createBufferSource() {
    const source = { connect() {}, disconnect() {}, start(time, offset) { this.started = { time, offset }; }, stop(time) { this.stopped = time; } };
    this.sources.push(source); return source;
  }
}

function setup(options = {}) {
  globalThis.AudioContext = FakeContext;
  globalThis.fetch = async url => ({ ok: true, arrayBuffer: async () => Uint8Array.of(url.includes('impact') ? 3 : url.includes('leather') ? 2 : 1).buffer });
  return createBookFoley({ paperUrl: '/paper.ogg', leatherUrl: '/leather.ogg', impactUrl: '/impact.ogg', ...options });
}
const motion = (currentTime, duration = 1500) => ({ ready: Promise.resolve(), currentTime, playState: 'running', effect: { getComputedTiming: () => ({ duration }) } });

test('foley aligns the recording to the current animation time and device latency', async () => {
  const foley = setup();
  assert.equal(FakeContext.instances.length, 0, 'Loading the diary does not create or start audio');
  assert.equal(await foley.play('paper', { animation: motion(420) }), true);
  const context = FakeContext.instances[0], source = context.sources[0];
  assert.equal(source.started.time, 10.005);
  assert.ok(Math.abs(source.started.offset - .455) < .0001, 'Delayed preparation seeks into the matching point of the motion');
  assert.equal(source.buffer.duration, 1.525, 'The texture spans the full 1.5s turn without slowing the paper recording');
  foley.stop();
  assert.equal(source.stopped, 10.02, 'Cancelling a turn fades and stops its sound');
  foley.destroy();
});

test('backward turns use their measured duration and closing leather gets its own impact', async () => {
  const foley = setup();
  await foley.play('leather', { animation: motion(10) });
  await foley.play('leather', { direction: 'backward', animation: motion(10, 1300) });
  const [opening, closing] = FakeContext.instances[0].sources;
  assert.equal(opening.stopped, 10.02, 'Reversing the cover cancels the previous sound');
  assert.equal(closing.buffer.duration, 1.44, 'The closing tap can decay naturally after contact');
  const data = closing.buffer.getChannelData(0), contact = Math.floor(1.288 * 8000);
  const peak = range => Math.max(...range.map(Math.abs));
  assert.ok(peak(data.slice(contact, contact + 300)) > peak(data.slice(100, contact)) * 1.5, 'The hard board contact is distinct from the softer leather movement');
  assert.ok(peak(data.slice(-100)) < .005, 'The contact decays instead of ending with a click');
  foley.destroy();
});

test('late decoding never replays a completed or cancelled turn', async () => {
  const foley = setup();
  await foley.prepare();
  assert.equal(await foley.play('paper', { animation: motion(1600) }), false);
  assert.equal(FakeContext.instances[0].sources.length, 0);
  let release;
  const animation = motion(100);
  animation.ready = new Promise(resolve => { release = resolve; });
  const pending = foley.play('leather', { animation });
  await Promise.resolve();
  foley.stop(); release();
  assert.equal(await pending, false);
  assert.equal(FakeContext.instances[0].sources.length, 0, 'A pending start stays cancelled after its animation becomes ready');
  foley.destroy();
});

test('muting and unavailable audio never block the book', async () => {
  const muted = setup({ getVolume: () => 0 });
  assert.equal(await muted.play('leather'), false);
  assert.equal(FakeContext.instances.length, 0);
  muted.destroy();
  globalThis.AudioContext = undefined;
  const unavailable = createBookFoley();
  assert.equal(await unavailable.play('leather'), false);
  unavailable.destroy();
});

test('material textures remain finite, bounded and adapt to shorter motion', () => {
  const paper = Float32Array.from({ length: 4000 }, (_, i) => Math.sin(i * 1.7) * .3);
  for (const material of ['paper', 'leather']) for (const direction of ['forward', 'backward']) {
    const samples = renderBookFoley({ sampleRate: 8000, duration: .32, material, direction, paper, leather: paper });
    assert.ok(samples.length >= 2560);
    assert.ok(samples.every(value => Number.isFinite(value) && Math.abs(value) <= .851));
    assert.ok(samples.some(value => Math.abs(value) > .1), 'Both materials remain audible without clipping');
  }
});

test('the recorded hardcover contact lands at the end of the closing motion', () => {
  const sampleRate = 8000, duration = 1.3;
  const impact = new Float32Array(sampleRate * .165);
  impact[Math.round(sampleRate * .032)] = 1;
  const data = renderBookFoley({ sampleRate, duration, material: 'leather', direction: 'backward', impact });
  let peakIndex = 0;
  for (let i = 1; i < data.length; i++) if (Math.abs(data[i]) > Math.abs(data[peakIndex])) peakIndex = i;
  assert.ok(Math.abs(peakIndex / sampleRate - duration) < .002, 'The recorded impact peak coincides with the cover reaching the book');
});

test('leather stays quiet and natural while the approved closing contact stays independent', () => {
  const sampleRate = 8000, duration = 1.3;
  const leather = Float32Array.from({ length: 12800 }, (_, i) => Math.sin(i * .7) * .2);
  const impact = new Float32Array(1320);
  impact[256] = 1; impact[300] = .6; impact[600] = .1;
  const opening = renderBookFoley({ sampleRate, duration, material: 'leather', leather });
  assert.ok(Math.max(...opening.map(Math.abs)) <= .221, 'The movement is quieter than the previous synthetic cover');
  const closing = renderBookFoley({ sampleRate, duration, material: 'leather', direction: 'backward', leather, impact });
  const contactOnly = renderBookFoley({ sampleRate, duration, material: 'leather', direction: 'backward', impact });
  assert.ok(closing.slice(sampleRate * duration).every((value, index) => value === contactOnly[sampleRate * duration + index]), 'Changing the leather texture leaves the final contact and its decay intact');
  assert.ok(renderBookFoley({ sampleRate, duration, material: 'leather' }).every(value => value === 0), 'An unavailable recording never falls back to the disliked synthesized creak');
});
