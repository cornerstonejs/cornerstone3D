import type { Types } from '@cornerstonejs/core';

/**
 * Supersamples a 3D polyline by adding interpolated points between existing points
 * to achieve a target spacing between points.
 *
 * @param polyline - Array of 3D points [x, y, z]
 * @param targetSpacing - Target spacing between points (default: 0.2)
 * @returns Supersampled polyline with additional interpolated points
 */
export default function supersamplePolyline3D(
  polyline: Types.Point3[],
  targetSpacing: number = 0.2
): Types.Point3[] {
  if (polyline.length < 2) {
    return [...polyline];
  }

  const supersampledPolyline: Types.Point3[] = [];

  for (let i = 0; i < polyline.length - 1; i++) {
    const currentPoint = polyline[i];
    const nextPoint = polyline[i + 1];

    // Add the current point
    supersampledPolyline.push([...currentPoint] as Types.Point3);

    // Calculate distance between current and next point
    const dx = nextPoint[0] - currentPoint[0];
    const dy = nextPoint[1] - currentPoint[1];
    const dz = nextPoint[2] - currentPoint[2];
    const segmentLength = Math.sqrt(dx * dx + dy * dy + dz * dz);

    // Calculate number of additional points needed for this segment
    const numAdditionalPoints = Math.floor(segmentLength / targetSpacing);

    if (numAdditionalPoints > 0) {
      // Calculate step size for interpolation
      const stepX = dx / (numAdditionalPoints + 1);
      const stepY = dy / (numAdditionalPoints + 1);
      const stepZ = dz / (numAdditionalPoints + 1);

      // Add interpolated points
      for (let j = 1; j <= numAdditionalPoints; j++) {
        const interpolatedPoint: Types.Point3 = [
          currentPoint[0] + stepX * j,
          currentPoint[1] + stepY * j,
          currentPoint[2] + stepZ * j,
        ];
        supersampledPolyline.push(interpolatedPoint);
      }
    }
  }

  // Add the last point
  supersampledPolyline.push([...polyline[polyline.length - 1]] as Types.Point3);

  return supersampledPolyline;
}

export { supersamplePolyline3D };
