#!/bin/sh
# Renders the 6 Play Store screenshots (1080x1920) from source.html.
cd "$(dirname "$0")"
CHROME="/c/Program Files/Google/Chrome/Application/chrome.exe"
for i in 1 2 3 4 5 6; do
  "$CHROME" --headless=new --disable-gpu --hide-scrollbars --force-device-scale-factor=2 \
    --virtual-time-budget=6000 --window-size=540,960 \
    --screenshot="$(cygpath -w "$PWD/raw$i.png")" "file:///$(cygpath -m "$PWD/source.html")#$i" 2>/dev/null
  python -c "from PIL import Image;Image.open('raw$i.png').convert('RGB').save('play-0$i.png')"
  rm "raw$i.png"
done
