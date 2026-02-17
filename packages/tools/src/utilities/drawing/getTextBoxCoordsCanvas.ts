import type { Types } from '@cornerstonejs/core';

/**
 * Determine the coordinates that will place the textbox to the right of the
 * annotation while keeping it inside viewport bounds when an element is provided.
 *
 * @param annotationCanvasPoints - The canvas points of the annotation's handles.
 * @param element - Viewport HTML element used to clamp textbox placement.
 * @param textLines - Text content used to estimate textbox size before rendering.
 * @returns - The coordinates for default placement of the textbox.
 */
export default function getTextBoxCoordsCanvas(
  annotationCanvasPoints: Array<Types.Point2>,
  element?: HTMLDivElement,
  textLines: Array<string> = []
): Types.Point2 {
  const corners = _determineCorners(annotationCanvasPoints);
  const centerY = (corners.top[1] + corners.bottom[1]) / 2;
  const defaultTextBoxCanvas = <Types.Point2>[corners.right[0], centerY];

  if (!element) {
    return defaultTextBoxCanvas;
  }

  const { width: textBoxWidth, height: textBoxHeight } =
    _estimateTextBoxSize(textLines);
  const margin = 4;
  const maxX = element.clientWidth - margin;
  const maxY = element.clientHeight - margin;
  let x = corners.right[0];
  let y = centerY - textBoxHeight / 2;

  if (x + textBoxWidth > maxX) {
    x = corners.left[0] - textBoxWidth;
  }

  x = Math.max(margin, Math.min(x, maxX - textBoxWidth));
  y = Math.max(margin, Math.min(y, maxY - textBoxHeight));

  return <Types.Point2>[x, y];
}

/**
 * Determine the handles that have the min/max x and y values.
 *
 * @param canvasPoints - The canvas points of the annotation's handles.
 * @returns - The top, left, bottom, and right handles.
 */
function _determineCorners(canvasPoints: Array<Types.Point2>) {
  const handlesLeftToRight = [canvasPoints[0], canvasPoints[1]].sort(_compareX);
  const handlesTopToBottom = [canvasPoints[0], canvasPoints[1]].sort(_compareY);
  const left = handlesLeftToRight[0];
  const right = handlesLeftToRight[handlesLeftToRight.length - 1];
  const top = handlesTopToBottom[0];
  const bottom = handlesTopToBottom[handlesTopToBottom.length - 1];

  return {
    left,
    top,
    bottom,
    right,
  };

  function _compareX(a, b) {
    return a[0] < b[0] ? -1 : 1;
  }
  function _compareY(a, b) {
    return a[1] < b[1] ? -1 : 1;
  }
}

/**
 * We estimate dimensions here (instead of measuring a rendered SVG bbox)
 * because this utility runs before drawing occurs and should stay a pure
 * placement helper shared by many tools.
 *
 * These constants intentionally mirror `drawTextBox` defaults:
 * - padding follows drawingSvg/drawTextBox.ts default (25px)
 * - line height approximates 14px font with 1.2em tspans
 * - average character width uses a conservative value for Helvetica/Arial
 *
 * Result: a stable pre-draw placement that prevents corner overflow without
 * requiring a two-pass draw/measure/redraw cycle in each tool.
 */
function _estimateTextBoxSize(textLines: Array<string>) {
  const estimatedPadding = 25;
  const estimatedCharWidth = 8;
  const estimatedLineHeight = 17;
  const longestLineLength = textLines.reduce(
    (max, line) => Math.max(max, line?.length ?? 0),
    0
  );
  const lineCount = Math.max(textLines.length, 1);
  const width = longestLineLength * estimatedCharWidth + estimatedPadding * 2;
  const height = lineCount * estimatedLineHeight + estimatedPadding * 2;

  return { width, height };
}
