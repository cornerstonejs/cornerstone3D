import { type Types, type VolumeViewport } from '@cornerstonejs/core';
import { vec2, vec3 } from 'gl-matrix';

const EPSILON = 1e-4;

/**
 * Calculates the center point and radius in canvas coordinate of a circle
 * from a set of world coordinates within the given viewport.
 *
 * The function projects the provided world coordinates into the
 * viewport's canvas coordinates and returns both the
 * calculated center and radius in canvas coordinates.
 *
 * @param points - The list of 3D points defining the circle - center and point on circle.
 * @param viewport - The current viewport.
 * @returns An array contains:
 *   - The first element: center in canvas coordinate.
 *   - The second element: radius in canvas coordinate.
 */

export function getCenterAndRadiusInCanvas(
  points: Types.Point3[],
  viewport: Types.IStackViewport | VolumeViewport
): { center: Types.Point2; radius: number } {
  const canvasPoints = points.map((p) => viewport.worldToCanvas(p));
  const [cBottom, cTop, cLeft, cRight] = canvasPoints;

  const center: Types.Point2 = [
    (cBottom[0] + cTop[0]) / 2,
    (cBottom[1] + cTop[1]) / 2,
  ];

  const worldHeight = vec3.distance(points[0], points[1]);
  const worldWidth = vec3.distance(points[2], points[3]);

  const canvasHeight = vec2.distance(cBottom, cTop);
  const canvasWidth = vec2.distance(cLeft, cRight);

  const scaleX = canvasWidth / worldWidth;
  const scaleY = canvasHeight / worldHeight;

  const worldRadius = worldHeight / 2;

  const radius =
    Math.abs(scaleX - scaleY) > EPSILON
      ? worldRadius * Math.min(scaleX, scaleY)
      : canvasHeight / 2;

  return {
    center: center,
    radius,
  };
}

export default getCenterAndRadiusInCanvas;
