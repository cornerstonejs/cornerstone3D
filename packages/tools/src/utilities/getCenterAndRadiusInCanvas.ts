import {
  getProjectionScaleIndices,
  type Types,
  type VolumeViewport,
} from '@cornerstonejs/core';

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
  const canvasCoordinates = points.map((p) => viewport.worldToCanvas(p));
  const bottom = canvasCoordinates[0];
  const top = canvasCoordinates[1];
  const right = canvasCoordinates[3];

  const center: Types.Point2 = [
    Math.floor((bottom[0] + top[0]) / 2),
    Math.floor((bottom[1] + top[1]) / 2),
  ];

  // Get your aspect ratio values
  const [sx, sy] = viewport.getAspectRatio?.() || [1, 1];
  const camera = viewport.getCamera();
  const { viewUp, viewPlaneNormal } = camera;

  const { idxX, idxY } = getProjectionScaleIndices(viewUp, viewPlaneNormal);

  // Determine which stretch corresponds to horizontal vs vertical in current orientation
  const stretchH = idxX === 0 ? sx : sy;
  const stretchV = idxY === 5 ? sy : sx;

  const verticalRadius = Math.abs(bottom[1] - center[1]);
  const horizontalRadius = Math.abs(right[0] - center[0]);

  let radius;
  if (sx !== 1.0 || sy !== 1.0) {
    radius = Math.min(verticalRadius * stretchV, horizontalRadius * stretchH);
  } else {
    radius = verticalRadius;
  }
  return { center, radius };
}
