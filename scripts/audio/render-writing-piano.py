"""Render the diary's sparse piano arrangement (Python + NumPy + FFmpeg).

Run from the repository root: python scripts/audio/render-writing-piano.py
Only this build script downloads samples; the portal plays one local MP3.
Source recordings: VSCO 2 CE, CC0. See app/assets/diary/AUDIO-CREDITS.md.
"""
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
import hashlib
import json
import subprocess
import tempfile
import urllib.request

import numpy as np


ROOT = Path(__file__).resolve().parents[2]
CACHE = Path(tempfile.gettempdir()) / 'preludio-writing-piano-samples'
COMMIT = '440300901dfe9275fd84e0b7763af1f8443ae62e'
BASE = f'https://raw.githubusercontent.com/sgossner/VSCO-2-CE/{COMMIT}/Keys/Upright%20Piano/'
RATE = 44100
SECONDS = 120
OUTPUT = ROOT / 'app/assets/diary/piano-unwind-v3.mp3'

# Quietest sampled dynamic, nearby original keys; no oscillator-generated piano.
SAMPLE_INDEXES = [10, 12, 14, 16, 18, 20, 22, 24]


def sample(index):
    name = f'Player_dyn1_rr1_{index:03d}.wav'
    path = CACHE / name
    if not path.exists():
        with urllib.request.urlopen(BASE + name, timeout=60) as response:
            path.write_bytes(response.read())
    pcm = subprocess.check_output([
        'ffmpeg', '-v', 'error', '-i', str(path), '-ar', str(RATE),
        '-ac', '2', '-f', 'f32le', '-',
    ])
    audio = np.frombuffer(pcm, dtype='<f4').reshape(-1, 2).copy()
    # Match the softly played keys by their early body, preserving each decay.
    body = audio[int(.04 * RATE):int(.8 * RATE)]
    rms = float(np.sqrt(np.mean(body ** 2)))
    audio *= .10 / max(rms, .0001)
    return 21 + 2 * index, audio


def main():
    CACHE.mkdir(exist_ok=True)
    with ThreadPoolExecutor(max_workers=4) as pool:
        samples = dict(pool.map(sample, SAMPLE_INDEXES))
    length = RATE * SECONDS
    mix = np.zeros((length, 2), dtype=np.float64)

    def note(midi, onset, level, hold=5.5):
        root = min(samples, key=lambda key: abs(key - midi))
        source = samples[root]
        ratio = 2 ** ((midi - root) / 12)
        count = min(int((hold + 1.3) * RATE), int((len(source) - 1) / ratio))
        positions = np.arange(count) * ratio
        original = np.arange(len(source))
        voice = np.column_stack([np.interp(positions, original, source[:, c]) for c in range(2)])
        # Gentle attack and pedal release; retain the recorded hammer and strings.
        attack = int(.016 * RATE)
        voice[:attack] *= (.5 - .5 * np.cos(np.linspace(0, np.pi, attack)))[:, None]
        release = min(int(1.3 * RATE), count)
        voice[-release:] *= (.5 + .5 * np.cos(np.linspace(0, np.pi, release)))[:, None]
        start = round(onset * RATE)
        # Render the decay across the loop boundary, rather than adding an ending.
        indices = (start + np.arange(count)) % length
        mix[indices] += voice * level

    # Related open voicings at 48 BPM, two bars per phrase. The second half
    # changes inversions and shared tones instead of repeating the first pass.
    # Each phrase has its own spacing and order, without adding busier notes.
    phrases = [
        # Voicing (bass, inner, middle, upper), onsets, voice order, touch.
        ((41, 57, 60, 67), (.13, 2.55, 5.09, 7.61), (1, 3, 2, 3), 1.00),
        ((52, 55, 62, 64), (.18, 3.05, 5.67, 8.02), (2, 3, 1, 2), .94),
        ((50, 57, 60, 65), (.13, 2.75, 6.25), (1, 2, 3), .97),
        ((46, 57, 62, 65), (.21, 3.32, 5.91, 8.25), (1, 3, 2, 1), .92),
        ((45, 55, 60, 64), (.12, 2.43, 5.48, 7.94), (2, 1, 3, 2), .96),
        ((43, 55, 60, 62), (.17, 3.36, 6.67), (1, 2, 3), .90),
        ((41, 57, 60, 64), (.14, 2.88, 5.46, 8.16), (1, 2, 3, 2), .97),
        ((52, 57, 60, 67), (.22, 3.20, 5.82, 8.40), (2, 3, 1, 3), .92),
        ((50, 53, 60, 64), (.16, 2.33, 6.31), (1, 3, 2), .95),
        ((46, 53, 60, 62), (.12, 3.57, 6.27, 8.71), (2, 1, 3, 2), .93),
        ((45, 57, 60, 65), (.18, 2.79, 5.16, 7.76), (1, 2, 3, 1), .94),
        ((43, 55, 62, 64), (.14, 3.12, 6.63), (2, 3, 1), .90),
    ]
    score = []
    for cell, (voicing, onsets, voices, touch) in enumerate(phrases):
        start = cell * 10 + .35
        events = [(voicing[0], start, .17, 6.2)]
        for position, (offset, voice) in enumerate(zip(onsets, voices, strict=True)):
            level = .085 if position == 3 else {1: .16, 2: .15, 3: .12}[voice]
            events.append((voicing[voice], start + offset, level, 5.8 if voice == 3 else 5.3))
        for midi, onset, level, hold in events:
            note(midi, onset, level * touch, hold)
            score.append({'midi': midi, 'onset': round(onset, 3), 'level': round(level * touch, 4)})

    # Small, quiet room reflections; circular offsets preserve the continuous bed.
    dry = mix.copy()
    for delay, level in [(.047, .075), (.083, .045), (.127, .025)]:
        reflection = np.roll(dry, round(delay * RATE), axis=0)
        mix += reflection[:, ::-1] * level
    # A quiet diffuse tail lets notes breathe, without a repeating delay effect.
    rng = np.random.default_rng(1987)
    tail_length = round(2.4 * RATE)
    times = np.arange(tail_length) / RATE
    for channel in range(2):
        impulse = rng.normal(size=tail_length) * np.exp(-times * 6.91 / 2.4)
        impulse[:round(.022 * RATE)] = 0
        spectrum = np.fft.rfft(impulse)
        frequencies = np.fft.rfftfreq(tail_length, 1 / RATE)
        spectrum *= np.exp(-(frequencies / 2600) ** 2) * (frequencies / (frequencies + 150))
        impulse = np.fft.irfft(spectrum, n=tail_length)
        impulse *= .24 / np.sqrt(np.sum(impulse ** 2))
        # Circular convolution also carries the room decay across the loop.
        mix[:, channel] += np.fft.irfft(
            np.fft.rfft(dry[:, channel]) * np.fft.rfft(impulse, n=length), n=length)
    raw = CACHE / 'writing-piano.f32'
    mix.astype('<f4').tofile(raw)
    # Warm tone without bright accents; leave the musical dynamics intact.
    filters = 'highpass=f=45,lowpass=f=4200,treble=g=-3:f=2200,volume=10dB'
    subprocess.run([
        'ffmpeg', '-v', 'error', '-f', 'f32le', '-ar', str(RATE), '-ac', '2',
        '-i', str(raw), '-af', filters, '-c:a', 'libmp3lame', '-b:a', '128k',
        '-map_metadata', '-1', '-id3v2_version', '3', '-y', str(OUTPUT),
    ], check=True)
    manifest = {
        'sourceCommit': COMMIT, 'seconds': SECONDS, 'bpm': 48, 'notes': score,
        'sampleSha256': {path.name: hashlib.sha256(path.read_bytes()).hexdigest()
                         for path in sorted(CACHE.glob('Player_dyn1_rr1_*.wav'))},
    }
    (CACHE / 'writing-piano-render.json').write_text(json.dumps(manifest, indent=2))
    print(json.dumps({'file': str(OUTPUT), 'bytes': OUTPUT.stat().st_size,
                      'seconds': SECONDS, 'notes': len(score)}))


if __name__ == '__main__':
    main()
