import type { Types } from '@cornerstonejs/core';

export type CanvasCoordinates = [
  Types.Point2, // bottom
  Types.Point2, // top
  Types.Point2, // left
  Types.Point2, // right
];

/**
 * It takes the canvas coordinates of the ellipse's four axis endpoints and returns
 * the top left and bottom right corners of their bounding box.
 *
 * The corners are derived from the extents of the points rather than from their
 * position in the array, so the result does not depend on the order the endpoints
 * are supplied in. A freshly drawn ellipse stores them as bottom/top/left/right, but
 * an ellipse round-tripped through a DICOM SR arrives major-axis-first; assuming the
 * draw-time order there collapsed the corners onto the center and made the recomputed
 * area register as empty ("Area: Oblique not supported").
 *
 * @param ellipseCanvasPoints - The coordinates of the ellipse in the canvas.
 * @returns An array of two points.
 */
export default function getCanvasEllipseCorners(
  ellipseCanvasPoints: CanvasCoordinates
): Array<Types.Point2> {
  const xs = ellipseCanvasPoints.map((point) => point[0]);
  const ys = ellipseCanvasPoints.map((point) => point[1]);

  const topLeft = <Types.Point2>[Math.min(...xs), Math.min(...ys)];
  const bottomRight = <Types.Point2>[Math.max(...xs), Math.max(...ys)];

  return [topLeft, bottomRight];
}
