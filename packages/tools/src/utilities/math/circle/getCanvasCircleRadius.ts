import { distanceToPoint } from '../point';
import { canvasCoordinates } from './_types';

/**
 * It takes the canvas coordinates of the circle corners and returns the top left and bottom right
 * corners of it
 *
 * @param circleCanvasPoints - The coordinates of the circle in the canvas.
 * @returns An array of two points.
 */
export default function getCanvasCircleRadius(
  circleCanvasPoints: canvasCoordinates
): number {
  const [center, end] = circleCanvasPoints;
  return distanceToPoint(center, end);
}
