#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TIMESTAMP="$(date '+%Y%m%d-%H%M%S')"
SUITE="legacy"
FORCE_COMPAT="false"
FORCE_CPU_RENDERING="false"
USE_ALL_PROJECTS="false"
declare -a PLAYWRIGHT_ARGS=()

for arg in "$@"; do
  case "$arg" in
    --next)
      SUITE="next"
      ;;
    --compat)
      FORCE_COMPAT="true"
      ;;
    --cpu)
      FORCE_CPU_RENDERING="true"
      ;;
    --all-projects)
      USE_ALL_PROJECTS="true"
      ;;
    *)
      PLAYWRIGHT_ARGS+=("$arg")
      ;;
  esac
done

# Default to chromium-only locally unless user explicitly opts into the full
# matrix (--all-projects) or passes their own --project=... flag.
if [[ "$USE_ALL_PROJECTS" == "false" ]]; then
  HAS_PROJECT_FLAG="false"
  for a in "${PLAYWRIGHT_ARGS[@]+"${PLAYWRIGHT_ARGS[@]}"}"; do
    case "$a" in
      --project|--project=*) HAS_PROJECT_FLAG="true" ;;
    esac
  done
  if [[ "$HAS_PROJECT_FLAG" == "false" ]]; then
    PLAYWRIGHT_ARGS+=("--project=chromium")
  fi
fi

# Next mode manages its own viewport/cpu settings via per-test query params
if [[ "$SUITE" == "next" ]]; then
  FORCE_COMPAT="false"
  FORCE_CPU_RENDERING="false"
fi

VIEWPORT_MODE="legacy"

if [[ "$SUITE" == "next" ]]; then
  VIEWPORT_MODE="next"
elif [[ "$FORCE_COMPAT" == "true" ]]; then
  VIEWPORT_MODE="compat"
fi

CPU_MODE_SUFFIX=""

if [[ "$FORCE_CPU_RENDERING" == "true" ]]; then
  CPU_MODE_SUFFIX="-cpu"
fi

if [[ "$SUITE" == "next" ]]; then
  RUN_SLUG="next-viewport-playwright"
else
  RUN_SLUG="${VIEWPORT_MODE}${CPU_MODE_SUFFIX}-playwright"
fi

# Auto-discover test files by directory convention
declare -a SELECTED_TESTS=()

if [[ "$SUITE" == "next" ]]; then
  mapfile -t SELECTED_TESTS < <(find "$ROOT_DIR/tests/nextViewport" -name '*.spec.ts' | sort)
else
  mapfile -t SELECTED_TESTS < <(find "$ROOT_DIR/tests" -name '*.spec.ts' -not -path '*/nextViewport/*' | sort)
fi

PROJECTS_DESC="chromium"
if [[ "$USE_ALL_PROJECTS" == "true" ]]; then
  PROJECTS_DESC="all"
fi

echo "Suite: $SUITE | Mode: $VIEWPORT_MODE | CPU: $FORCE_CPU_RENDERING | Projects: $PROJECTS_DESC | Tests: ${#SELECTED_TESTS[@]}"
echo

RUN_DIR="$ROOT_DIR/reports/$RUN_SLUG/$TIMESTAMP"
LOG_FILE="$RUN_DIR/$RUN_SLUG.log"
HTML_REPORT_DIR="$RUN_DIR/html-report"
TEST_RESULTS_DIR="$RUN_DIR/test-results"

cd "$ROOT_DIR"

mkdir -p "$RUN_DIR"

set +e
PLAYWRIGHT_FORCE_COMPAT="$FORCE_COMPAT" \
PLAYWRIGHT_FORCE_CPU_RENDERING="$FORCE_CPU_RENDERING" \
PLAYWRIGHT_HTML_OUTPUT_DIR="$HTML_REPORT_DIR" \
PLAYWRIGHT_HTML_OPEN="never" \
npx playwright test \
  "${SELECTED_TESTS[@]}" \
  --output "$TEST_RESULTS_DIR" \
  "${PLAYWRIGHT_ARGS[@]}" 2>&1 | tee "$LOG_FILE"
PLAYWRIGHT_EXIT_CODE=${PIPESTATUS[0]}
set -e

echo
echo "Compat mode forced: $FORCE_COMPAT"
echo "CPU rendering forced: $FORCE_CPU_RENDERING"
echo "Run directory: $RUN_DIR"
echo "HTML report: $HTML_REPORT_DIR/index.html"

exit "$PLAYWRIGHT_EXIT_CODE"
