#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TIMESTAMP="$(date '+%Y%m%d-%H%M%S')"
PACKAGE_NAME="all"
FORCE_VIEWPORT_V2="false"
FORCE_CPU_RENDERING="false"
PACKAGE_SET="false"
declare -a PLAYWRIGHT_ARGS=()

for arg in "$@"; do
  case "$arg" in
    all|core|tools|next)
      if [[ "$PACKAGE_SET" == "true" ]]; then
        echo "Usage: ./scripts/run-playright.sh [all|core|tools|next] [--viewport-v2] [--cpu] [playwright args...]" >&2
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
      PLAYWRIGHT_ARGS+=("$arg")
      ;;
  esac
done

# Next mode manages its own viewport/cpu settings via per-test query params
if [[ "$PACKAGE_NAME" == "next" ]]; then
  FORCE_VIEWPORT_V2="false"
  FORCE_CPU_RENDERING="false"
fi

VIEWPORT_MODE="legacy"

if [[ "$PACKAGE_NAME" == "next" ]]; then
  VIEWPORT_MODE="next"
elif [[ "$FORCE_VIEWPORT_V2" == "true" ]]; then
  VIEWPORT_MODE="viewport-v2"
fi

CPU_MODE_SUFFIX=""

if [[ "$FORCE_CPU_RENDERING" == "true" ]]; then
  CPU_MODE_SUFFIX="-cpu"
fi

if [[ "$PACKAGE_NAME" == "next" ]]; then
  RUN_SLUG="next-viewport-playwright"
else
  RUN_SLUG="${PACKAGE_NAME}-${VIEWPORT_MODE}${CPU_MODE_SUFFIX}-playwright"
fi

declare -a CORE_TESTS=(
  "tests/MPRReformat.spec.ts"
  "tests/contextPoolRenderingEngine.spec.ts"
  "tests/dicomImageLoaderWADOURI.spec.ts"
  "tests/renderingPipeline.spec.ts"
  "tests/stackAPI.spec.ts"
  "tests/stackBasic.spec.ts"
  "tests/stackBasicTiled.spec.ts"
  "tests/stackProperties.spec.ts"

  "tests/surfaceRendering.spec.ts"
  "tests/ultrasoundColors.spec.ts"
  "tests/volumeBasic.spec.ts"
  "tests/volumeBasicTiled.spec.ts"
)

declare -a TOOLS_TESTS=(
  "tests/contourRendering.spec.ts"
  "tests/contourRenderingTiled.spec.ts"
  "tests/interpolationContourSegmentation.spec.ts"
  "tests/labelmapGlobalConfiguration.spec.ts"
  "tests/labelmapRendering.spec.ts"
  "tests/labelmapRenderingTiled.spec.ts"
  "tests/labelmapSwapping.spec.ts"
  "tests/labelmapsegmentationtools.spec.ts"
  "tests/multipleToolGroups.spec.ts"
  "tests/rectangleROIThresholdStatisticsMIM.spec.ts"
  "tests/splineContourSegmentationTools.spec.ts"
  "tests/stackAnnotation.spec.ts"
  "tests/stackAnnotationTiled.spec.ts"
  "tests/stackLabelmapSegmentation/circleScissor.spec.ts"
  "tests/stackLabelmapSegmentation/circularBrush.spec.ts"
  "tests/stackLabelmapSegmentation/circularEraser1.spec.ts"
  "tests/stackLabelmapSegmentation/circularEraser2.spec.ts"
  "tests/stackLabelmapSegmentation/dynamicThresholdTests.spec.ts"
  "tests/stackLabelmapSegmentation/rectangleScissor.spec.ts"
  "tests/stackLabelmapSegmentation/sphereBrush.spec.ts"
  "tests/stackManipulationTools.spec.ts"
  "tests/volumeAnnotation.spec.ts"
  "tests/volumeAnnotationTiled.spec.ts"
)

declare -a NEXT_TESTS=(
  "tests/nextViewport/nextEcg.spec.ts"
  "tests/nextViewport/nextLabelmapOverlapPlayground.spec.ts"
  "tests/nextViewport/nextLabelmapRendering.spec.ts"
  "tests/nextViewport/nextLabelmapSegmentationTools.spec.ts"
  "tests/nextViewport/nextLabelmapSliceRendering.spec.ts"
  "tests/nextViewport/nextLabelmapSliceRenderingTools.spec.ts"
  "tests/nextViewport/nextMultiVolumeAPI.spec.ts"
  "tests/nextViewport/nextStackAPI.spec.ts"
  "tests/nextViewport/nextStackLabelmapSegmentation.spec.ts"
  "tests/nextViewport/nextStackManipulationTools.spec.ts"
  "tests/nextViewport/nextVideo.spec.ts"
  "tests/nextViewport/nextVolumeAnnotationTools.spec.ts"
  "tests/nextViewport/nextWsi.spec.ts"
)

declare -a SELECTED_TESTS=()

case "$PACKAGE_NAME" in
  all)
    SELECTED_TESTS=("${CORE_TESTS[@]}" "${TOOLS_TESTS[@]}")
    ;;
  core)
    SELECTED_TESTS=("${CORE_TESTS[@]}")
    ;;
  tools)
    SELECTED_TESTS=("${TOOLS_TESTS[@]}")
    ;;
  next)
    SELECTED_TESTS=("${NEXT_TESTS[@]}")
    ;;
esac

RUN_DIR="$ROOT_DIR/reports/$RUN_SLUG/$TIMESTAMP"
LOG_FILE="$RUN_DIR/$RUN_SLUG.log"
HTML_REPORT_DIR="$RUN_DIR/html-report"
TEST_RESULTS_DIR="$RUN_DIR/test-results"

cd "$ROOT_DIR"

mkdir -p "$RUN_DIR"

set +e
PLAYWRIGHT_FORCE_VIEWPORT_V2="$FORCE_VIEWPORT_V2" \
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
echo "Viewport V2 forced: $FORCE_VIEWPORT_V2"
echo "CPU rendering forced: $FORCE_CPU_RENDERING"
echo "Run directory: $RUN_DIR"
echo "HTML report: $HTML_REPORT_DIR/index.html"

exit "$PLAYWRIGHT_EXIT_CODE"
