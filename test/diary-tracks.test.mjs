import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { prepareRecordedLoop, loadForest, loadPiano } from '../app/diary-tracks.js';

function fixture() {
  const createBuffer = (numberOfChannels, length, sampleRate) => {
    const channels = Array.from({ length: numberOfChannels }, () => new Float32Array(length));
    return { numberOfChannels, length, sampleRate, getChannelData: channel => channels[channel] };
  };
  const recording = createBuffer(2, 5000, 1000);
  for (let channel = 0; channel < 2; channel++) {
    const samples = recording.getChannelData(channel);
    for (let i = 0; i < samples.length; i++) samples[i] = .2 * Math.sin(i * .08 + channel);
  }
  return { recording, context: { createBuffer, decodeAudioData: async () => recording } };
}

test('both loop lengths preserve stereo, original samples and a continuous boundary', () => {
  for (const overlap of [2.5, .04]) {
    const { context, recording } = fixture();
    const originals = [0, 1].map(channel => recording.getChannelData(channel).slice());
    const loop = prepareRecordedLoop(context, recording, overlap);
    const overlapSamples = Math.min(overlap * 1000, 625);
    assert.equal(loop.numberOfChannels, 2);
    assert.equal(loop.length, 5000 - overlapSamples);
    for (let channel = 0; channel < 2; channel++) {
      const samples = loop.getChannelData(channel);
      assert.deepEqual(recording.getChannelData(channel), originals[channel]);
      assert.equal(samples[0], originals[channel][overlapSamples]);
      assert.ok(Math.abs(samples[0] - samples.at(-1)) < .025, 'The loop has no sudden jump');
      assert.ok(samples.every(value => Number.isFinite(value) && Math.abs(value) < .284));
    }
    assert.notDeepEqual(loop.getChannelData(0), loop.getChannelData(1), 'Stereo spatial detail survives');
  }
});

for (const [name, loader, file] of [
  ['forest', loadForest, 'forest-recorded-v1.mp3'],
  ['piano', loadPiano, 'piano-unwind-v1.mp3'],
]) {
  test(`${name} downloads only on request, retries failures and caches only successful decodes`, async t => {
    const { context } = fixture();
    const requests = [];
    t.mock.method(globalThis, 'fetch', async (url, options) => {
      requests.push({ url, options });
      return requests.length === 1 ? new Response(null, { status: 503 }) : new Response(new Uint8Array([73, 68, 51]));
    });
    assert.equal(requests.length, 0);
    await assert.rejects(loader(context), /503/);
    await assert.rejects(loader({ ...context, decodeAudioData: async () => { throw new Error('Bad audio'); } }), /Bad audio/);
    const first = await loader(context);
    const second = await loader(context);
    assert.equal(requests.length, 3, 'Neither HTTP errors nor decode errors poison the recording cache');
    assert.ok(requests[2].url.pathname.endsWith(`/app/assets/diary/${file}`));
    assert.equal(requests[2].options.credentials, 'omit');
    assert.equal(requests[2].options.cache, 'force-cache');
    assert.notEqual(first, second, 'Each playback context gets its own buffer');
    const controller = new AbortController(); controller.abort();
    await assert.rejects(loader(context, controller.signal), { name: 'AbortError' });
    const duringDecode = new AbortController();
    await assert.rejects(loader({ ...context, decodeAudioData: async () => {
      duringDecode.abort();
      return fixture().recording;
    } }, duringDecode.signal), { name: 'AbortError' });
  });

  test(`${name} ships a complete locally hosted MP3 and its license credits`, () => {
    const bytes = readFileSync(new URL(`../app/assets/diary/${file}`, import.meta.url));
    assert.ok(bytes.length > 1_500_000 && bytes.length < 2_000_000);
    assert.equal(bytes.subarray(0, 3).toString(), 'ID3');
    const credits = readFileSync(new URL('../app/assets/diary/AUDIO-CREDITS.md', import.meta.url), 'utf8');
    assert.ok(credits.includes(file));
    assert.match(credits, name === 'forest' ? /BurghRecords/ : /Indieteur/);
    assert.match(credits, /CC0 1\.0 Universal/);
  });
}
