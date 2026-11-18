#!/bin/sh
# Vice Harbor v2.1 — check3d.sh: run the whole headless verification.
# Serves game/ on :8080, runs simCheck + missionCheck, then renders
# the 4 screenshots into screenshots/ (1280x720, quality 88).
# Stale screenshots are removed first so an old frame can never leak
# into the dossier (the dossier caps at 4 screenshots).
# Exit non-zero if any check fails. Usage: tools/check3d.sh
set -e
cd "$(dirname "$0")/.."
PORT=8080
CHROME="$HOME/.cache/ms-playwright/chromium_headless_shell-1255/chrome-headless-shell-linux64/chrome-headless-shell"

node serve.ts --port $PORT > /tmp/vice-harbor-serve.log 2>&1 &
SERVE_PID=$!
trap 'kill $SERVE_PID 2>/dev/null || true' EXIT
sleep 1

echo "== simCheck =="
node tools/simCheck.mjs --port $PORT
echo "== missionCheck =="
node tools/missionCheck.mjs --port $PORT

echo "== screenshots =="
mkdir -p screenshots
rm -f screenshots/*.jpg
for shot in start mission race stats; do
  n=$(echo "$shot" | sed -e 's/start/1/' -e 's/mission/2/' -e 's/race/3/' -e 's/stats/4/')
  "$CHROME" --headless --no-sandbox --disable-gpu --use-angle=swiftshader \
    --enable-unsafe-swiftshader --hide-scrollbars \
    --window-size=1280,720 --virtual-time-budget=15000 \
    --screenshot="screenshots/$n-$shot.jpg" \
    "http://127.0.0.1:$PORT/?shot=$shot&seed=1" 2>/dev/null
  echo "screenshots/$n-$shot.jpg: $(stat -c%s "screenshots/$n-$shot.jpg") bytes"
done
echo "check3d: all done"
