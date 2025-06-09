import type { Types } from '@cornerstonejs/core';
import { getSignedArea } from '../math/polyline';

/**
 * Supersamples a 2D polyline by adding interpolated points between existing points
 * to achieve a target spacing between points.
 *
 * @param polyline - Array of 2D points [x, y]
 * @param targetSpacing - Target spacing between points (default: 0.2)
 * @returns Supersampled polyline with additional interpolated points
 */
export default function supersamplePolyline2D(
  polyline: Types.Point2[],
  targetSpacing: number = 0.2
): Types.Point2[] {
  if (polyline.length < 2) {
    return [...polyline];
  }

  const supersampledPolyline: Types.Point2[] = [];

  for (let i = 0; i < polyline.length - 1; i++) {
    const currentPoint = polyline[i];
    const nextPoint = polyline[i + 1];

    // Add the current point
    supersampledPolyline.push([...currentPoint] as Types.Point2);

    // Calculate distance between current and next point
    const dx = nextPoint[0] - currentPoint[0];
    const dy = nextPoint[1] - currentPoint[1];
    const segmentLength = Math.sqrt(dx * dx + dy * dy);

    // Calculate number of additional points needed for this segment
    const numAdditionalPoints = Math.floor(segmentLength / targetSpacing);

    if (numAdditionalPoints > 0) {
      // Calculate step size for interpolation
      const stepX = dx / (numAdditionalPoints + 1);
      const stepY = dy / (numAdditionalPoints + 1);

      // Add interpolated points
      for (let j = 1; j <= numAdditionalPoints; j++) {
        const interpolatedPoint: Types.Point2 = [
          currentPoint[0] + stepX * j,
          currentPoint[1] + stepY * j,
        ];
        supersampledPolyline.push(interpolatedPoint);
      }
    }
  }

  // Add the last point
  supersampledPolyline.push([...polyline[polyline.length - 1]] as Types.Point2);

  return supersampledPolyline;
}

export { supersamplePolyline2D };
