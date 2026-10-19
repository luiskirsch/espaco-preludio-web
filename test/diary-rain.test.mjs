import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { prepareRainLoop, loadCabinRain } from '../app/diary-rain.js';

function fixture() {
  const createBuffer = (numberOfChannels, length, sampleRate) => {
    const channels = Array.from({ length: numberOfChannels }, () => new Float32Array(length));
    return { numberOfChannels, length, sampleRate, getChannelData: channel => channels[channel] };
  };
  const context = { createBuffer };
  const recording = createBuffer(2, 5000, 1000);
  for (let channel = 0; channel < 2; channel++) {
    const samples = recording.getChannelData(channel);
    for (let i = 0; i < samples.length; i++) samples[i] = .2 * Math.sin(i * .08 + channel);
  }
  context.decodeAudioData = async () => recording;
  return { context, recording };
}

test('natural rain loop preserves the recording and blends the boundary without clipping', () => {
  const { context, recording } = fixture();
  const original = recording.getChannelData(0).slice();
  const loop = prepareRainLoop(context, recording);
  assert.equal(loop.numberOfChannels, 2);
  assert.equal(loop.length, 4375);
  assert.deepEqual(recording.getChannelData(0), original, 'Original recording is never mutated');
  for (let channel = 0; channel < 2; channel++) {
    const samples = loop.getChannelData(channel);
    assert.equal(samples[0], recording.getChannelData(channel)[625]);
    assert.ok(Math.abs(samples[0] - samples.at(-1)) < .025, 'Loop boundary is continuous');
    assert.ok(samples.every(value => Number.isFinite(value) && Math.abs(value) <= .201));
  }
});

test('rain loads from the bundled recording, retries errors and reuses successful bytes', async t => {
  const { context } = fixture();
  const requests = [];
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    requests.push({ url, options });
    return requests.length === 1 ? new Response(null, { status: 503 }) : new Response(new Uint8Array([73, 68, 51]));
  });
  await assert.rejects(loadCabinRain(context), /gravação de chuva/);
  const first = await loadCabinRain(context);
  const second = await loadCabinRain(context);
  assert.equal(requests.length, 2, 'Successful bytes are reused across playback contexts');
  assert.match(requests[1].url.pathname, /app\/assets\/diary\/cabin-rain-recorded-v1\.mp3$/);
  assert.equal(requests[1].options.credentials, 'omit');
  assert.notEqual(first, second, 'Each playback receives its own prepared buffer');
  const controller = new AbortController(); controller.abort();
  await assert.rejects(loadCabinRain(context, controller.signal), { name: 'AbortError' });
});

test('the rain shipped with the portal is an MP3 field recording with its source credits', () => {
  const bytes = readFileSync(new URL('../app/assets/diary/cabin-rain-recorded-v1.mp3', import.meta.url));
  assert.ok(bytes.length > 500000 && bytes.length < 1500000);
  assert.equal(bytes.subarray(0, 3).toString(), 'ID3');
  const credits = readFileSync(new URL('../app/assets/diary/AUDIO-CREDITS.md', import.meta.url), 'utf8');
  assert.match(credits, /Ylmir/); assert.match(credits, /CC0/);
});

test('page turns use the credited local paper recording', () => {
  const bytes = readFileSync(new URL('../app/assets/diary/page-turn.ogg', import.meta.url));
  assert.ok(bytes.length > 9000 && bytes.length < 12000);
  assert.equal(bytes.subarray(0, 4).toString(), 'OggS');
  const credits = readFileSync(new URL('../app/assets/diary/AUDIO-CREDITS.md', import.meta.url), 'utf8');
  assert.match(credits, /FlippingPages\.ogg/);
  assert.match(credits, /\byd\b/);
  assert.match(credits, /CC0/);
});
