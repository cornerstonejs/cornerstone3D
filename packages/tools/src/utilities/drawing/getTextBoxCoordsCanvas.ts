import type { Types } from '@cornerstonejs/core';

/**
 * Determine the coordinates that will place the textbox to the right of the
 * annotation.
 *
 * @param annotationCanvasPoints - The canvas points of the annotation's handles.
 * @returns - The coordinates for default placement of the textbox.
 */
export default function getTextBoxCoordsCanvas(
  annotationCanvasPoints: Array<Types.Point2>
): Types.Point2 {
  const corners = _determineCorners(annotationCanvasPoints);
  const centerY = (corners.top[1] + corners.bottom[1]) / 2;
  const textBoxCanvas = <Types.Point2>[corners.right[0], centerY];

  return textBoxCanvas;
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
  const right = handlesLeftToRight[handlesLeftToRight.length - 1];
  const top = handlesTopToBottom[0];
  const bottom = handlesTopToBottom[handlesTopToBottom.length - 1];

  return {
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
