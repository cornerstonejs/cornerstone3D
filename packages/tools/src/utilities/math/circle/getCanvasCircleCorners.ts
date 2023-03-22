import type { Types } from '@cornerstonejs/core';
import { distanceToPoint } from '../point';
import { canvasCoordinates } from './_types';

/**
 * It takes the canvas coordinates of the circle corners (wrapping square rectangle)
 * and returns the top left and bottom right
 * corners of it
 *
 * @param circleCanvasPoints - The coordinates of the circle in the canvas.
 * @returns An array of two points.
 */
export default function getCanvasCircleCorners(
  circleCanvasPoints: canvasCoordinates
): Array<Types.Point2> {
  const [center, end] = circleCanvasPoints;
  const radius = distanceToPoint(center, end);

  const topLeft = <Types.Point2>[center[0] - radius, center[1] - radius];
  const bottomRight = <Types.Point2>[center[0] + radius, center[1] + radius];

  return [topLeft, bottomRight];
}
