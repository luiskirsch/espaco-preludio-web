import test from 'node:test';
import assert from 'node:assert/strict';
import { synthesizeCabinRain } from '../app/diary-audio.js';

// Frequency energy of a Hann-windowed excerpt; independent of the synthesis
// filters so a return to bright white-noise rain is caught by the check.
function spectrum(samples, offset, size = 4096) {
  const real = new Float64Array(size);
  const imaginary = new Float64Array(size);
  for (let i = 0; i < size; i += 1) {
    let reverse = 0;
    for (let value = i, bits = size; bits > 1; bits >>= 1, value >>= 1) reverse = (reverse << 1) | (value & 1);
    real[reverse] = samples[offset + i] * (0.5 - 0.5 * Math.cos(2 * Math.PI * i / (size - 1)));
  }
  for (let width = 2; width <= size; width *= 2) {
    for (let start = 0; start < size; start += width) {
      for (let i = 0; i < width / 2; i += 1) {
        const angle = -2 * Math.PI * i / width;
        const left = start + i;
        const right = left + width / 2;
        const re = real[right] * Math.cos(angle) - imaginary[right] * Math.sin(angle);
        const im = real[right] * Math.sin(angle) + imaginary[right] * Math.cos(angle);
        real[right] = real[left] - re;
        imaginary[right] = imaginary[left] - im;
        real[left] += re;
        imaginary[left] += im;
      }
    }
  }
  return real.slice(0, size / 2).map((value, i) => value * value + imaginary[i] * imaginary[i]);
}

test('cabin rain stays warm, bounded, stereo and free of a salient loop boundary', () => {
  const sampleRate = 24000;
  const channels = synthesizeCabinRain(sampleRate, { seed: 247 });
  assert.equal(channels.length, 2);
  assert.equal(channels[0].length, sampleRate * 29);
  let totalEnergy = 0;
  let cross = 0;
  const energies = [0, 0];
  let peak = 0;
  for (let channel = 0; channel < 2; channel += 1) {
    const samples = channels[channel];
    let derivativeEnergy = 0;
    for (let i = 0; i < samples.length; i += 1) {
      assert.ok(Number.isFinite(samples[i]));
      energies[channel] += samples[i] * samples[i];
      peak = Math.max(peak, Math.abs(samples[i]));
      if (i) derivativeEnergy += (samples[i] - samples[i - 1]) ** 2;
      if (channel === 0) cross += samples[i] * channels[1][i];
    }
    totalEnergy += energies[channel];
    const derivativeRms = Math.sqrt(derivativeEnergy / (samples.length - 1));
    assert.ok(Math.abs(samples[0] - samples.at(-1)) < derivativeRms * 3, 'loop seam must resemble normal sample variation');
    for (let start = 0; start < samples.length; start += sampleRate) {
      let energy = 0;
      for (let i = start; i < Math.min(start + sampleRate, samples.length); i += 1) energy += samples[i] ** 2;
      const rms = Math.sqrt(energy / sampleRate);
      assert.ok(rms > 0.09 && rms < 0.19, 'rain must stay steady without sudden loud bursts or gaps');
    }
  }
  const rms = Math.sqrt(totalEnergy / (channels[0].length * 2));
  assert.ok(rms > 0.12 && rms <= 0.141);
  assert.ok(peak <= 0.681, 'headroom must remain even at full volume');
  const correlation = cross / Math.sqrt(energies[0] * energies[1]);
  assert.ok(correlation > -0.2 && correlation < 0.8, 'stereo should be diffuse without inverted channels');

  let highEnergy = 0;
  let audibleEnergy = 0;
  for (const offset of [sampleRate, sampleRate * 8, sampleRate * 18]) {
    const bins = spectrum(channels[0], offset);
    for (let i = 1; i < bins.length; i += 1) {
      const frequency = i * sampleRate / 4096;
      if (frequency > 80) audibleEnergy += bins[i];
      if (frequency > 4000) highEnergy += bins[i];
    }
  }
  assert.ok(highEnergy / audibleEnergy < 0.1, 'high-frequency hiss must not dominate the sheltered rain');
});

test('offline rain render is reproducible while new seeds produce new weather', () => {
  const first = synthesizeCabinRain(8000, { duration: 2, seed: 19 });
  const same = synthesizeCabinRain(8000, { duration: 2, seed: 19 });
  const another = synthesizeCabinRain(8000, { duration: 2, seed: 20 });
  assert.deepEqual(first, same);
  assert.notDeepEqual(first, another);
});
