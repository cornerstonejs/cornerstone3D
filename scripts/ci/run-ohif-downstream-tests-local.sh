#!/bin/zsh

set -euo pipefail

SCRIPT_DIR=$(cd "$(dirname "$0")" && pwd)
REPO_ROOT=$(cd "$SCRIPT_DIR/../.." && pwd)

OHIF_REPO_URL=${OHIF_REPO_URL:-https://github.com/OHIF/Viewers.git}
OHIF_REF=${OHIF_REF:-master}
OHIF_DIR=${OHIF_DIR:-$REPO_ROOT/.ohif-downstream/${OHIF_REF}-tests-$$}
OHIF_RUN_UNIT_TESTS=${OHIF_RUN_UNIT_TESTS:-true}
OHIF_RUN_E2E_TESTS=${OHIF_RUN_E2E_TESTS:-true}
OHIF_UNIT_TEST_COMMAND=${OHIF_UNIT_TEST_COMMAND:-bun run test:unit:ci}
OHIF_E2E_TEST_COMMAND=${OHIF_E2E_TEST_COMMAND:-bun run test:e2e:ci}

if [[ -e "$OHIF_DIR" ]]; then
  echo "Refusing to use existing path: $OHIF_DIR" >&2
  exit 1
fi

mkdir -p "$(dirname "$OHIF_DIR")"

echo "Cloning OHIF into $OHIF_DIR"
git clone --depth 1 --branch "$OHIF_REF" "$OHIF_REPO_URL" "$OHIF_DIR"

echo "Initializing OHIF submodules"
git -C "$OHIF_DIR" submodule update --init --recursive

echo "Installing Cornerstone dependencies"
cd "$REPO_ROOT"
bun install --frozen-lockfile

echo "Building Cornerstone packages for OHIF"
bun run build:esm

echo "Installing OHIF dependencies"
cd "$OHIF_DIR"
bun install

echo "Linking local Cornerstone packages into OHIF node_modules"
cd "$REPO_ROOT"
node "$REPO_ROOT/scripts/link-ohif-cornerstone-node-modules.mjs" "$OHIF_DIR"

cd "$OHIF_DIR"

if [[ "$OHIF_RUN_UNIT_TESTS" == "true" ]]; then
  echo "Running OHIF unit tests"
  eval "$OHIF_UNIT_TEST_COMMAND"
fi

if [[ "$OHIF_RUN_E2E_TESTS" == "true" ]]; then
  echo "Installing Playwright browsers"
  npx playwright install

  echo "Running OHIF e2e tests"
  eval "$OHIF_E2E_TEST_COMMAND"
fi

echo "OHIF downstream tests completed"
echo "Clone location: $OHIF_DIR"
