# Chuva na cabana

`cabin-rain-recorded-v1.mp3` derives from `3.mp3` in **Rain (loopable)**,
a field recording by **Ylmir**, published on OpenGameArt on 2016-03-28.

- Source and original download: https://opengameart.org/content/rain-loopable
- Original archive: https://opengameart.org/sites/default/files/Rain%20MP3.zip
- License: CC0 1.0 Universal — https://creativecommons.org/publicdomain/zero/1.0/
- Changes: low-frequency rumble removal, gentle treble reduction, loudness
  adjustment and MP3 encoding at 160 kbps / 44.1 kHz stereo. Runtime blends
  the loop boundary and mixes a separate, quieter synthesized piano.

No artificial noise is added to the rain. The bundled recording is served
from the portal's own origin; playback does not contact OpenGameArt.

# Um passeio pela floresta

`forest-recorded-v1.mp3` derives from **Birds In Spring (Scotland)** by
**BurghRecords**, published on Freesound on 2019-03-18.

- Source: https://freesound.org/people/BurghRecords/sounds/463903/
- Public HQ preview: https://cdn.freesound.org/previews/463/463903_7241289-hq.mp3
- License: CC0 1.0 Universal — https://creativecommons.org/publicdomain/zero/1.0/
- Recorded material: stereo spring birdsong near a river in Scotland.
- Changes: 90-second excerpt starting at 12s, 90Hz high-pass, 9kHz low-pass,
  constant gain of +10.5dB, MP3 at 160 kbps / 44.1 kHz stereo.
- Runtime joins the boundaries with a 2.5-second equal-power crossfade.
  There are no synthesized birds, notes or generated noise in this preset.

# Piano para desacelerar

`piano-unwind-v2.mp3` is an original sparse arrangement created for the
Espaço Prelúdio diary, using the softest dynamic layer of **Upright Piano**
from **VSCO 2 Community Edition**. The piano was sampled by **Simon Dalzell /
Ivy Audio** and distributed by **Sam Gossner / Versilian Studios**.

- Library: https://versilian-studios.com/vsco-community/
- Sample source, pinned revision: https://github.com/sgossner/VSCO-2-CE/tree/440300901dfe9275fd84e0b7763af1f8443ae62e/Keys/Upright%20Piano
- Sample license: CC0 1.0 Universal — https://github.com/sgossner/VSCO-2-CE/blob/440300901dfe9275fd84e0b7763af1f8443ae62e/LICENSE
- Samples: `Player_dyn1_rr1_010.wav` through `_024.wav`, even indexes only.
  Sample key mapping follows the library's `MappingChart.txt`.
- Arrangement: 120 seconds, 48 BPM, 56 softly played notes, open voicings
  and long spaces. No percussion, rhythmic backing or additional instruments.
- Processing: slight touch/timing variations, gentle pedal releases, quiet
  room reflections and diffuse reverb, 45Hz high-pass, 4.2kHz low-pass,
  restrained treble and constant gain. MP3 at 128 kbps / 44.1 kHz stereo.
- Reproducible score and renderer: `scripts/audio/render-writing-piano.py`
  (Python with NumPy and FFmpeg). Source samples stay in the build cache;
  playback downloads only the finished MP3. No oscillators generate notes.
- Decays wrap across the musical cycle; runtime smooths the final boundary
  with a 40ms crossfade. The previous `Mystical Piano` track is no longer used.

Both tracks load only after a playback request, from the portal's own
origin. Playback does not contact Freesound or OpenGameArt. Compressed
recordings are cached for subsequent plays; decoded buffers are released
when playback stops. The diary volume control and gentle start/stop fades
apply to both tracks.

# Virada de página

`page-turn.ogg` is **FlippingPages.ogg**, a paper page-turn recording by **yd**,
published on OpenGameArt on 2012-01-31.

- Source: https://opengameart.org/content/old-pagesflip-with-sound
- Original download: https://opengameart.org/sites/default/files/FlippingPages_0.ogg
- License: CC0 1.0 Universal — https://creativecommons.org/publicdomain/zero/1.0/
- Changes to source file: none. Runtime uses overlapping windowed grains to
  match the turn duration without lowering the pitch. Its volume follows the
  same motion curve as the paper. Playback stays on the portal's own origin.

# Capa dura e couro

`hardcover-close.ogg` derives from **Audio/bookClose.ogg** in **RPG Audio 1.0**
by **Kenney Vleugels (Kenney.nl)**.

- Source: https://kenney.nl/assets/rpg-audio
- Original archive: https://kenney.nl/media/pages/assets/rpg-audio/8e99002d76-1677590336/kenney_rpg-audio.zip
- License: CC0 1.0 Universal — https://creativecommons.org/publicdomain/zero/1.0/
- Changes: excerpt from 0.045s to 0.210s, mono, 50Hz high-pass, 6.5kHz
  low-pass, restrained gain, short boundary fades and Vorbis encoding.
- Runtime places the recording's main contact transient at the end of the
  actual closing transition. Its level is independent of the movement texture.

`leather-cover-move.ogg` derives from **Leather - Creak, soft** by **Vrymaa**,
published on Freesound on 2024-05-05.

- Source: https://freesound.org/people/Vrymaa/sounds/734598/
- Public HQ preview: https://cdn.freesound.org/previews/734/734598_13973196-hq.mp3
- License: CC0 1.0 Universal — https://creativecommons.org/publicdomain/zero/1.0/
- Recorded material: soft movement of heavy leather garments, close-miked.
- Changes: excerpt from 4.35s to 5.95s, mono, 120Hz high-pass, 3.8kHz
  low-pass, short boundary fades and Vorbis encoding.
- Runtime plays one quiet natural gesture at its original pitch. The volume
  follows the cover's motion; no oscillators, looping or artificial creaks are
  mixed into the leather. The closing board contact remains a separate layer.

All material sounds use the diary's volume control. No third-party audio
service is contacted during playback.
