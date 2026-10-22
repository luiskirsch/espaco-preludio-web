"""Prepare the diary's piano recording (Python standard library + FFmpeg).

Run from the repository root: python scripts/audio/render-writing-piano.py
An optional --source points to an already downloaded original Ogg recording.
Playback uses only the local MP3. See app/assets/diary/AUDIO-CREDITS.md.
"""
import argparse
import hashlib
import json
from pathlib import Path
import subprocess
import tempfile
import urllib.request


ROOT = Path(__file__).resolve().parents[2]
SOURCE_URL = ('https://upload.wikimedia.org/wikipedia/commons/9/90/'
              'Erik_Satie_-_gymnopedies_-_la_1_ere._lent_et_douloureux.ogg')
SOURCE_SHA1 = '96b2343c81047abd9723488d8540b5a2af688233'
OUTPUT = ROOT / 'app/assets/diary/piano-unwind-v4.mp3'


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--source', type=Path, default=Path(tempfile.gettempdir()) /
                        'preludio-satie-robin-alciatore.ogg')
    source = parser.parse_args().source
    if not source.exists():
        request = urllib.request.Request(SOURCE_URL, headers={
            'User-Agent': 'EspacoPreludioAudioBuild/1.0'})
        with urllib.request.urlopen(request, timeout=60) as response:
            source.write_bytes(response.read())
    if hashlib.sha1(source.read_bytes()).hexdigest() != SOURCE_SHA1:
        raise ValueError('The source does not match the credited original recording.')
    # Remove only the silent lead-in; keep the complete performance and timing.
    # The original's natural final decay receives a quiet fade before repetition.
    filters = ('highpass=f=40,lowpass=f=8000,afade=t=in:d=0.08,'
               'afade=t=out:st=177.5:d=4.188571')
    subprocess.run([
        'ffmpeg', '-v', 'error', '-ss', '1.9', '-i', str(source),
        '-af', filters, '-ar', '44100', '-ac', '2', '-c:a', 'libmp3lame',
        '-b:a', '128k', '-map_metadata', '-1', '-id3v2_version', '3',
        '-metadata', 'title=Gymnop\u00e9die No. 1',
        '-metadata', 'artist=Robin Alciatore',
        '-metadata', 'composer=Erik Satie',
        '-metadata', 'copyright=Public domain recording, courtesy of Musopen',
        '-y', str(OUTPUT),
    ], check=True)
    print(json.dumps({'file': str(OUTPUT), 'bytes': OUTPUT.stat().st_size,
                      'sourceSha1': SOURCE_SHA1, 'performer': 'Robin Alciatore'}))


if __name__ == '__main__':
    main()
