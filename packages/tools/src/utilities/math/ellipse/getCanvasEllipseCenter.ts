import type { Types } from '@cornerstonejs/core';

/**
 * It takes the canvas coordinates of the ellipse corners and returns the center point of it
 *
 * @param ellipseCanvasPoints - The coordinates of the ellipse in the canvas.
 * @returns center point.
 */
export default function getCanvasEllipseCenter(ellipseCanvasPoints: Types.Point2[]) : Types.Point2 {
  const [bottom, top, left, right] = ellipseCanvasPoints;
  const topLeft = [left[0], top[1]];
  const bottomRight = [right[0], bottom[1]];
  return [(topLeft[0] + bottomRight[0]) / 2, (topLeft[1] + bottomRight[1]) / 2] as Types.Point2;
}
