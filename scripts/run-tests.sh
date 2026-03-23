#!/usr/bin/env bash

set -uo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PACKAGE_NAME="all"
FORCE_VIEWPORT_V2="false"
FORCE_CPU_RENDERING="false"
PACKAGE_SET="false"

for arg in "$@"; do
  case "$arg" in
    all|core|tools)
      if [[ "$PACKAGE_SET" == "true" ]]; then
        echo "Usage: ./scripts/run-tests.sh [all|core|tools] [--viewport-v2] [--cpu]" >&2
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
      echo "Usage: ./scripts/run-tests.sh [all|core|tools] [--viewport-v2] [--cpu]" >&2
      exit 1
      ;;
  esac
done

KARMA_EXIT_CODE=0
PLAYRIGHT_EXIT_CODE=0
declare -a RUNNER_ARGS=("$PACKAGE_NAME")

if [[ "$FORCE_VIEWPORT_V2" == "true" ]]; then
  RUNNER_ARGS+=("--viewport-v2")
fi

if [[ "$FORCE_CPU_RENDERING" == "true" ]]; then
  RUNNER_ARGS+=("--cpu")
fi

"$ROOT_DIR/scripts/run-karma.sh" "${RUNNER_ARGS[@]}" || KARMA_EXIT_CODE=$?
"$ROOT_DIR/scripts/run-playright.sh" "${RUNNER_ARGS[@]}" || PLAYRIGHT_EXIT_CODE=$?

if [[ "$KARMA_EXIT_CODE" -ne 0 || "$PLAYRIGHT_EXIT_CODE" -ne 0 ]]; then
  exit 1
fi
