#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TIMESTAMP="$(date '+%Y%m%d-%H%M%S')"
FORCE_CPU_RENDERING="false"
USE_NEXT="false"
declare -a KARMA_ARGS=()

for arg in "$@"; do
  case "$arg" in
    --next)
      USE_NEXT="true"
      ;;
    --cpu)
      FORCE_CPU_RENDERING="true"
      ;;
    *)
      KARMA_ARGS+=("$arg")
      ;;
  esac
done

# --next runs the tests two times: on the GPU, then with CPU rendering forced
if [[ "$USE_NEXT" == "true" ]]; then
  echo "Running karma in --next mode (gpu + cpu)"
  echo

  NEXT_EXIT=0

  # GPU run
  echo "=== Next: GPU ==="
  "$0" "${KARMA_ARGS[@]+"${KARMA_ARGS[@]}"}" || NEXT_EXIT=$?

  echo
  echo "=== Next: CPU ==="
  "$0" --cpu "${KARMA_ARGS[@]+"${KARMA_ARGS[@]}"}" || NEXT_EXIT=$?

  exit "$NEXT_EXIT"
fi

VIEWPORT_MODE="legacy"

CPU_MODE_SUFFIX=""

if [[ "$FORCE_CPU_RENDERING" == "true" ]]; then
  CPU_MODE_SUFFIX="-cpu"
fi

RUN_SLUG="${VIEWPORT_MODE}${CPU_MODE_SUFFIX}-karma"
RUN_DIR="$ROOT_DIR/reports/$RUN_SLUG/$TIMESTAMP"
LOG_FILE="$RUN_DIR/$RUN_SLUG.log"

cd "$ROOT_DIR"

mkdir -p "$RUN_DIR"

echo "Suite: karma | CPU: $FORCE_CPU_RENDERING"
echo

set +e
FORCE_CPU_RENDERING="$FORCE_CPU_RENDERING" \
npx karma start --single-run "${KARMA_ARGS[@]+"${KARMA_ARGS[@]}"}" 2>&1 | tee "$LOG_FILE"
KARMA_EXIT_CODE=${PIPESTATUS[0]}
set -e

# Save new CPU baselines if any were created during this run
node -e "
  const fs = require('fs');
  const path = require('path');
  const log = fs.readFileSync(process.argv[1], 'utf8');
  const regex = /\[KARMA_BASELINE_CREATE\](\{.*\})/g;
  let match, count = 0;
  while ((match = regex.exec(log)) !== null) {
    try {
      const data = JSON.parse(match[1]);
      const filePath = path.join('karma-baselines', data.mode, data.outputName + '.png');
      fs.mkdirSync(path.dirname(filePath), { recursive: true });
      const base64 = data.image.replace(/^data:image\/png;base64,/, '');
      fs.writeFileSync(filePath, Buffer.from(base64, 'base64'));
      count++;
    } catch (e) {}
  }
  if (count) console.log('Created ' + count + ' new karma baseline(s) in karma-baselines/');
" "$LOG_FILE" || true

REPORT_NAME="$RUN_SLUG-$TIMESTAMP"
node "$ROOT_DIR/scripts/generate-karma-html-report.js" "$LOG_FILE" "" "$REPORT_NAME" || true

# The decoder tests have their own karma run, karma.decoders.conf.js. They
# draw nothing, so the CPU pass skips them, and so does a run narrowed with
# KARMA_GREP or KARMA_PACKAGE.
DECODERS_EXIT_CODE=0
if [[ "$FORCE_CPU_RENDERING" != "true" && -z "${KARMA_GREP:-}" && -z "${KARMA_PACKAGE:-}" ]]; then
  echo
  echo "Suite: karma decoders"
  echo

  set +e
  npx karma start ./karma.decoders.conf.js 2>&1 | tee "$RUN_DIR/$RUN_SLUG-decoders.log"
  DECODERS_EXIT_CODE=${PIPESTATUS[0]}
  set -e

  if [[ "$KARMA_EXIT_CODE" -eq 0 ]]; then
    KARMA_EXIT_CODE=$DECODERS_EXIT_CODE
  fi
fi

echo
echo "CPU rendering forced: $FORCE_CPU_RENDERING"
echo "Decoders exit code: $DECODERS_EXIT_CODE"
echo "Run directory: $RUN_DIR"
echo "Image report: $ROOT_DIR/reports/$REPORT_NAME/index.html"

exit "$KARMA_EXIT_CODE"
