#!/bin/bash
set -euo pipefail

REPO_PATH="${2:-/repo}"
OUTPUT_PATH="${3:-/output}"
PORT="${4:-8080}"

run_build() {
  mkdir -p "${OUTPUT_PATH}"
  /build.sh
}

start_server() {
  cd "${OUTPUT_PATH}"
  exec python3 -m http.server "${PORT}" --bind 0.0.0.0
}

watch_loop() {
  if ! command -v inotifywait >/dev/null 2>&1; then
    echo "ERROR: inotifywait not found. Install inotify-tools in the image."
    exit 1
  fi

  echo "Watching ${REPO_PATH} for changes..."
  echo "Preview URL: http://localhost:${PORT}"

  run_build || true

  (
    cd "${OUTPUT_PATH}"
    python3 -m http.server "${PORT}" --bind 0.0.0.0
  ) &
  SERVER_PID=$!

  trap 'kill ${SERVER_PID} >/dev/null 2>&1 || true; exit 0' INT TERM

  while inotifywait -qq -r -e modify,create,delete,move \
    --exclude '(^|/)(\.git|node_modules|\.idea|\.vscode)(/|$)' \
    "${REPO_PATH}"; do
    echo "Change detected. Rebuilding..."
    run_build || true
    echo "Rebuild finished."
  done
}

case "${1:-build}" in
  build)
    run_build
    ;;
  serve)
    start_server
    ;;
  watch)
    watch_loop
    ;;
  *)
    exec "$@"
    ;;
esac
