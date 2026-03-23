#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TIMESTAMP="$(date '+%Y%m%d-%H%M%S')"
PACKAGE_NAME="all"
FORCE_VIEWPORT_V2="false"
FORCE_CPU_RENDERING="false"
PACKAGE_SET="false"
declare -a KARMA_ARGS=()

for arg in "$@"; do
  case "$arg" in
    all|core|tools)
      if [[ "$PACKAGE_SET" == "true" ]]; then
        echo "Usage: ./scripts/run-karma.sh [all|core|tools] [--viewport-v2] [--cpu] [karma args...]" >&2
        exit 1
      fi

      PACKAGE_NAME="$arg"
      PACKAGE_SET="true"
      ;;
    --viewport-v2)
      FORCE_VIEWPORT_V2="true"
      ;;
    --cpu)
      FORCE_CPU_RENDERING="true"
      ;;
    *)
      KARMA_ARGS+=("$arg")
      ;;
  esac
done

VIEWPORT_MODE="legacy"

if [[ "$FORCE_VIEWPORT_V2" == "true" ]]; then
  VIEWPORT_MODE="viewport-v2"
fi

CPU_MODE_SUFFIX=""

if [[ "$FORCE_CPU_RENDERING" == "true" ]]; then
  CPU_MODE_SUFFIX="-cpu"
fi

RUN_SLUG="${PACKAGE_NAME}-${VIEWPORT_MODE}${CPU_MODE_SUFFIX}-karma"

RUN_DIR="$ROOT_DIR/reports/$RUN_SLUG/$TIMESTAMP"
LOG_FILE="$RUN_DIR/$RUN_SLUG.log"
REPORT_NAME="$RUN_SLUG/$TIMESTAMP/html-report"

cd "$ROOT_DIR"

mkdir -p "$RUN_DIR"

set +e
if [[ "$PACKAGE_NAME" == "all" ]]; then
  FORCE_VIEWPORT_V2="$FORCE_VIEWPORT_V2" \
    FORCE_CPU_RENDERING="$FORCE_CPU_RENDERING" \
    yarn test:ci "${KARMA_ARGS[@]}" 2>&1 | tee "$LOG_FILE"
else
  KARMA_PACKAGE="$PACKAGE_NAME" \
    FORCE_VIEWPORT_V2="$FORCE_VIEWPORT_V2" \
    FORCE_CPU_RENDERING="$FORCE_CPU_RENDERING" \
    yarn test:ci "${KARMA_ARGS[@]}" 2>&1 | tee "$LOG_FILE"
fi
KARMA_EXIT_CODE=${PIPESTATUS[0]}
set -e

node "$ROOT_DIR/scripts/generate-karma-html-report.js" "$LOG_FILE" "" "$REPORT_NAME"

echo
echo "Viewport V2 forced: $FORCE_VIEWPORT_V2"
echo "CPU rendering forced: $FORCE_CPU_RENDERING"
echo "Run directory: $RUN_DIR"
echo "HTML report: $ROOT_DIR/reports/$REPORT_NAME/index.html"

exit "$KARMA_EXIT_CODE"
