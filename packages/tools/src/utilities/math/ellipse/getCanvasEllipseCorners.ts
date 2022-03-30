import type { Types } from '@cornerstonejs/core';

type canvasCoordinates = [
  Types.Point2, // bottom
  Types.Point2, // top
  Types.Point2, // left
  Types.Point2 // right
];

/**
 * It takes the canvas coordinates of the ellipse corners and returns the top left and bottom right
 * corners of it
 *
 * @param ellipseCanvasPoints - The coordinates of the ellipse in the canvas.
 * @returns An array of two points.
 */
export default function getCanvasEllipseCorners(
  ellipseCanvasPoints: canvasCoordinates
): Array<Types.Point2> {
  const [bottom, top, left, right] = ellipseCanvasPoints;

  const topLeft = <Types.Point2>[left[0], top[1]];
  const bottomRight = <Types.Point2>[right[0], bottom[1]];

  return [topLeft, bottomRight];
}
