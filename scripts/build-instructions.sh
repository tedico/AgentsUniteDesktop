#!/bin/sh
# Export the printable instruction page to PDF using the installed Chrome.
# No dependencies. Run after every change to docs/instructions/*.html.
set -e
cd "$(dirname "$0")/.."
CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
SRC="$PWD/docs/instructions/AgentsUniteDesktop-Instructions.html"
OUT="$PWD/docs/instructions/AgentsUniteDesktop-Instructions.pdf"
[ -x "$CHROME" ] || { echo "Chrome not found at $CHROME" >&2; exit 1; }
rm -f "$OUT"
# Separate throwaway profile so a running Chrome does not block headless mode.
"$CHROME" --headless=new --disable-gpu --no-first-run --no-default-browser-check \
  --disable-extensions --user-data-dir="$(mktemp -d)" \
  --no-pdf-header-footer --print-to-pdf="$OUT" "file://$SRC" >/dev/null 2>&1 &
PID=$!
for i in $(seq 1 60); do
  if [ -s "$OUT" ] && tail -c 32 "$OUT" 2>/dev/null | grep -q '%%EOF'; then break; fi
  sleep 0.5
done
kill "$PID" 2>/dev/null; wait "$PID" 2>/dev/null || true
[ -s "$OUT" ] || { echo "PDF export failed" >&2; exit 1; }
echo "wrote $OUT"

# Also copy to Desktop for easy access
DESKTOP_OUT="/Users/teds/Desktop/AgentsUniteDesktop-Instructions.pdf"
cp "$OUT" "$DESKTOP_OUT"
echo "copied to $DESKTOP_OUT"
