#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
TMPDIR="$(mktemp -d)"
PORT="8766"
SERVER_PID=""

cleanup() {
  if [[ -n "$SERVER_PID" ]]; then
    kill "$SERVER_PID" >/dev/null 2>&1 || true
  fi
  rm -rf "$TMPDIR"
}
trap cleanup EXIT

cat > "$TMPDIR/index.html" <<'HTML'
<!doctype html>
<html>
  <head>
    <title>Token Saver Test</title>
  </head>
  <body>
    <header><nav>Home About Contact</nav></header>
    <main>
      <article>
        <h1>Token Saver Test</h1>
        <p>This is the first paragraph of a test page.</p>
        <p>This is the second paragraph of a test page, included to verify truncation and extraction.</p>
        <p>This is the third paragraph of a test page, included to verify truncation and extraction.</p>
      </article>
    </main>
    <footer>Footer</footer>
  </body>
</html>
HTML

python3 -m http.server "$PORT" --directory "$TMPDIR" >/tmp/pi-read-url-smoke-http.log 2>&1 &
SERVER_PID="$!"
sleep 1

OUTPUT="$({
  pi -e "$ROOT_DIR" -p "Use read_url on http://127.0.0.1:$PORT with maxChars 1200 and return only the page title."
} 2>&1)"

echo "$OUTPUT"

if [[ "$OUTPUT" != *"Token Saver Test"* ]]; then
  echo "Smoke test failed: expected output to contain 'Token Saver Test'" >&2
  exit 1
fi

echo "Smoke test passed."
