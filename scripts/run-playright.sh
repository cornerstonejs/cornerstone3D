#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SCRIPT_PATH="${BASH_SOURCE[0]}"
TIMESTAMP="$(date '+%Y%m%d-%H%M%S')"
SUITE="legacy"
FORCE_COMPAT="false"
FORCE_CPU_RENDERING="false"
USE_ALL_PROJECTS="false"
RUN_ALL_MODES="false"
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
    --all)
      RUN_ALL_MODES="true"
      ;;
    *)
      PLAYWRIGHT_ARGS+=("$arg")
      ;;
  esac
done

if [[ "$RUN_ALL_MODES" == "true" ]]; then
  declare -a PASSTHROUGH_ARGS=()
  if [[ "$USE_ALL_PROJECTS" == "true" ]]; then
    PASSTHROUGH_ARGS+=("--all-projects")
  fi
  if [[ "$FORCE_CPU_RENDERING" == "true" ]]; then
    PASSTHROUGH_ARGS+=("--cpu")
  fi
  PASSTHROUGH_ARGS+=("${PLAYWRIGHT_ARGS[@]+"${PLAYWRIGHT_ARGS[@]}"}")

  declare -a MODES=("legacy" "compat" "next")
  declare -A MODE_EXIT_CODES=()
  declare -A MODE_DURATIONS=()
  declare -A MODE_LOG_FILES=()
  OVERALL_EXIT=0

  compute_mode_slug() {
    local mode="$1"
    local cpu_suffix=""
    if [[ "$FORCE_CPU_RENDERING" == "true" && "$mode" != "next" ]]; then
      cpu_suffix="-cpu"
    fi
    case "$mode" in
      next) echo "next-viewport-playwright" ;;
      *)    echo "${mode}${cpu_suffix}-playwright" ;;
    esac
  }

  find_latest_log() {
    local slug="$1"
    local log_dir="$ROOT_DIR/reports/$slug"
    [[ -d "$log_dir" ]] || return 0
    local latest
    latest=$(ls -1t "$log_dir" 2>/dev/null | head -n 1 || true)
    [[ -n "$latest" ]] || return 0
    local log_file="$log_dir/$latest/$slug.log"
    [[ -f "$log_file" ]] || return 0
    echo "$log_file"
  }

  format_duration() {
    local total="${1:-0}"
    local mins=$((total / 60))
    local secs=$((total % 60))
    if [[ $mins -gt 0 ]]; then
      printf '%dm%02ds' "$mins" "$secs"
    else
      printf '%ds' "$secs"
    fi
  }

  summarize_log() {
    local log_file="$1"
    if [[ -z "$log_file" || ! -f "$log_file" ]]; then
      echo "    (log not available)"
      return 0
    fi
    local tail_lines
    tail_lines=$(tail -n 400 "$log_file" | sed $'s/\033\\[[0-9;]*m//g')
    local counts
    counts=$(echo "$tail_lines" | grep -E '^[[:space:]]*[0-9]+[[:space:]]+(passed|failed|flaky|skipped|did not run|interrupted)( |$)' || true)
    if [[ -n "$counts" ]]; then
      echo "$counts" | sed -E 's/^[[:space:]]+/    /'
    fi
    local failed_tests
    failed_tests=$(echo "$tail_lines" | grep -E '^[[:space:]]*\[.+\][[:space:]]+›' | sort -u || true)
    if [[ -n "$failed_tests" ]]; then
      echo "    Failing:"
      echo "$failed_tests" | head -n 15 | sed -E 's/^[[:space:]]+/      /'
      local total
      total=$(echo "$failed_tests" | wc -l | tr -d ' ')
      if [[ "$total" -gt 15 ]]; then
        echo "      ... $((total - 15)) more"
      fi
    fi
    if [[ -z "$counts" && -z "$failed_tests" ]]; then
      echo "    (no Playwright summary found; see $log_file)"
    fi
    return 0
  }

  mode_index=0
  for mode in "${MODES[@]}"; do
    echo
    echo "============================================================"
    echo " Running playwright suite: $mode"
    echo "============================================================"
    echo

    declare -a MODE_ARGS=()
    case "$mode" in
      compat) MODE_ARGS+=("--compat") ;;
      next)   MODE_ARGS+=("--next") ;;
    esac

    START_TIME=$(date +%s)
    set +e
    if [[ $mode_index -eq 0 ]]; then
      bash "$SCRIPT_PATH" "${MODE_ARGS[@]+"${MODE_ARGS[@]}"}" "${PASSTHROUGH_ARGS[@]+"${PASSTHROUGH_ARGS[@]}"}"
    else
      PLAYWRIGHT_SKIP_REBUILD=true \
        bash "$SCRIPT_PATH" "${MODE_ARGS[@]+"${MODE_ARGS[@]}"}" "${PASSTHROUGH_ARGS[@]+"${PASSTHROUGH_ARGS[@]}"}"
    fi
    MODE_EXIT_CODES[$mode]=$?
    set -e
    END_TIME=$(date +%s)
    MODE_DURATIONS[$mode]=$((END_TIME - START_TIME))
    MODE_LOG_FILES[$mode]="$(find_latest_log "$(compute_mode_slug "$mode")")"

    if [[ "${MODE_EXIT_CODES[$mode]}" -ne 0 ]]; then
      OVERALL_EXIT="${MODE_EXIT_CODES[$mode]}"
    fi
    mode_index=$((mode_index + 1))
  done

  echo
  echo "============================================================"
  echo " Summary"
  echo "============================================================"
  first_mode="true"
  for mode in "${MODES[@]}"; do
    if [[ "$first_mode" == "true" ]]; then
      first_mode="false"
    else
      echo
      echo "  ------------------------------------------------------------"
    fi
    code="${MODE_EXIT_CODES[$mode]}"
    duration_str="$(format_duration "${MODE_DURATIONS[$mode]:-0}")"
    if [[ "$code" -eq 0 ]]; then
      echo "  $mode: PASS  (${duration_str})"
    else
      echo "  $mode: FAIL  (exit $code, ${duration_str})"
    fi
    summarize_log "${MODE_LOG_FILES[$mode]:-}"
    log_file="${MODE_LOG_FILES[$mode]:-}"
    if [[ -n "$log_file" ]]; then
      run_dir="$(dirname "$log_file")"
      html_index="$run_dir/html-report/index.html"
      echo "    Log:    $log_file"
      if [[ -f "$html_index" ]]; then
        echo "    Report: $html_index"
      else
        echo "    Report: $run_dir/html-report (index.html not found)"
      fi
    fi
  done

  exit "$OVERALL_EXIT"
fi

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
PLAYWRIGHT_USE_BUNDLED_CHROMIUM=true \
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
