import type { Types } from '@cornerstonejs/core';

/**
 * With a given vertices (points) coordinates in 2D or 3D IJK, it calculates the minimum and maximum
 * coordinate in each axis, and returns them. If clipBounds are provided it also
 * clip the min, max to the provided width, height and depth
 *
 * @param points - shape corner points coordinates (IJK)
 * @param clipBounds - bounds to clip the min, max
 * @returns [[xMin,xMax],[yMin,yMax], [zMin,zMax]]
 */
function getBoundingBoxAroundShape(
  points: Types.Point2[] | Types.Point3[],
  clipBounds?: Types.Point2 | Types.Point3
): [Types.Point2, Types.Point2, Types.Point2 | null] {
  let xMin = Infinity;
  let xMax = -Infinity;
  let yMin = Infinity;
  let yMax = -Infinity;
  let zMin = Infinity;
  let zMax = -Infinity;

  const is3D = points[0] && points[0].length === 3;

  points.forEach((p) => {
    xMin = Math.min(p[0], xMin);
    xMax = Math.max(p[0], xMax);
    yMin = Math.min(p[1], yMin);
    yMax = Math.max(p[1], yMax);

    if (is3D) {
      zMin = Math.min(p[2] ?? zMin, zMin);
      zMax = Math.max(p[2] ?? zMax, zMax);
    }
  });

  xMin = Math.floor(xMin);
  xMax = Math.floor(xMax);
  yMin = Math.floor(yMin);
  yMax = Math.floor(yMax);

  if (clipBounds) {
    // clip the min, max to the provided dimensions
    xMin = Math.max(0, xMin);
    xMax = Math.min(clipBounds[0] - 1, xMax);
    yMin = Math.max(0, yMin);
    yMax = Math.min(clipBounds[1] - 1, yMax);

    if (is3D && clipBounds.length === 3) {
      zMin = Math.floor(zMin);
      zMax = Math.floor(zMax);
      zMin = Math.max(0, zMin);
      zMax = Math.min(clipBounds[2] - 1, zMax);
    }
  }

  return is3D
    ? [
        [xMin, xMax],
        [yMin, yMax],
        [zMin, zMax],
      ]
    : [[xMin, xMax], [yMin, yMax], null];
}

export default getBoundingBoxAroundShape;
