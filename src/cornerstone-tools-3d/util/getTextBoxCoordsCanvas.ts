/**
 * Determine the coordinates that will place the textbox to the right of the
 * annotation.
 *
 * @param {Object} handles - The handles of the annotation.
 * @returns {Object} - The coordinates for default placement of the textbox
 */
export default function getTextBoxCoordsCanvas(canvasPoints) {
  const corners = _determineCorners(canvasPoints);
  const centerY = (corners.top[1] + corners.bottom[1]) / 2;
  const textBoxCanvas = [corners.right[0], centerY];

  return textBoxCanvas;
}

/**
 * Determine the handles that have the min/max x and y values.
 *
 * @param {Object} handles - The handles of the annotation.
 * @returns {Object} - The top, left, bottom, and right handles
 */
function _determineCorners(canvasPoints) {
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
