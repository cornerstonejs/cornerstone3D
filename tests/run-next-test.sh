#!/bin/bash
#
# Runs all Next viewport Playwright tests.
#
# Usage:
#   ./tests/run-next-test.sh              # run all tests
#   ./tests/run-next-test.sh --update     # update baseline screenshots
#   ./tests/run-next-test.sh tests/nextEcg.spec.ts  # run a single spec
#
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$SCRIPT_DIR"

SPECS=(
  "tests/nextLabelmapRendering.spec.ts"
  "tests/nextLabelmapOverlapPlayground.spec.ts"
  "tests/nextLabelmapSegmentationTools.spec.ts"
  "tests/nextLabelmapSliceRendering.spec.ts"
  "tests/nextLabelmapSliceRenderingTools.spec.ts"
  "tests/nextVolumeAnnotationTools.spec.ts"
  "tests/nextStackManipulationTools.spec.ts"
  "tests/nextMultiVolumeAPI.spec.ts"
  "tests/nextStackAPI.spec.ts"
  "tests/nextWsi.spec.ts"
  "tests/nextVideo.spec.ts"
  "tests/nextEcg.spec.ts"
)

SERIAL_SPECS=(
  "tests/nextStackLabelmapSegmentation.spec.ts"
)

# Only build the examples these tests actually use.
EXAMPLES="nextLabelmapRendering nextLabelmapOverlapPlayground nextLabelmapSegmentationTools nextLabelmapSliceRendering nextLabelmapSliceRenderingTools nextStackLabelmapSegmentation nextVolumeAnnotationTools nextStackManipulationTools nextMultiVolumeAPI nextStackAPI nextWsi nextVideo nextEcg"

PROJECT="chromium"
UPDATE_FLAG=""
PORT=3333
SERVER_PID=""

# ── Parse args ──────────────────────────────────────────────────────
CUSTOM_SPECS=()
for arg in "$@"; do
  case "$arg" in
    --update) UPDATE_FLAG="--update-snapshots" ;;
    *)        CUSTOM_SPECS+=("$arg") ;;
  esac
done

if [[ ${#CUSTOM_SPECS[@]} -gt 0 ]]; then
  SPECS=("${CUSTOM_SPECS[@]}")
  SERIAL_SPECS=()
fi

# ── Kill existing server on our port ────────────────────────────────
LISTENER_PID="$(lsof -tiTCP:${PORT} -sTCP:LISTEN || true)"
if [[ -n "$LISTENER_PID" ]]; then
  echo "-- Stopping existing process on :${PORT} --"
  kill "$LISTENER_PID"
  sleep 1
fi

# ── Build only the needed examples, then serve ──────────────────────
cleanup() {
  if [[ -n "$SERVER_PID" ]]; then
    kill "$SERVER_PID" 2>/dev/null || true
    wait "$SERVER_PID" 2>/dev/null || true
  fi
}
trap cleanup EXIT

echo "-- Building ${EXAMPLES// /, } --"
NODE_OPTIONS=--max_old_space_size=32896 \
  node ./utils/ExampleRunner/build-all-examples-cli.js --build --fromRoot $EXAMPLES

echo "-- Serving on :${PORT} --"
npx serve .static-examples --listen ${PORT} &>/dev/null &
SERVER_PID=$!

# Wait for server (poll every 1s, max 120s)
for _ in $(seq 1 120); do
  if curl -fsS "http://localhost:${PORT}" >/dev/null 2>&1; then
    break
  fi
  if ! kill -0 "$SERVER_PID" 2>/dev/null; then
    echo "Server failed to start."
    exit 1
  fi
  sleep 1
done

if ! curl -fsS "http://localhost:${PORT}" >/dev/null 2>&1; then
  echo "Timed out waiting for server on :${PORT}."
  exit 1
fi

# ── Run all specs in a single parallel Playwright invocation ────────
if [[ -n "$UPDATE_FLAG" ]]; then
  echo "-- Updating baseline screenshots --"
fi

echo ""
echo "-- Running ${#SPECS[@]} spec(s) in parallel --"
echo ""

PLAYWRIGHT_REUSE_EXISTING_SERVER=true \
  npx playwright test "${SPECS[@]}" \
  --project="$PROJECT" \
  --reporter=list \
  $UPDATE_FLAG

if [[ ${#SERIAL_SPECS[@]} -gt 0 ]]; then
  echo ""
  echo "-- Running ${#SERIAL_SPECS[@]} spec(s) sequentially --"
  echo ""

  PLAYWRIGHT_REUSE_EXISTING_SERVER=true \
    npx playwright test "${SERIAL_SPECS[@]}" \
    --project="$PROJECT" \
    --reporter=list \
    $UPDATE_FLAG
fi
