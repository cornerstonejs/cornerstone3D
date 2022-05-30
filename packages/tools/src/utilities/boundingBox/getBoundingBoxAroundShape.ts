import type { Types } from '@cornerstonejs/core';

/**
 * With a given vertices (points) coordinates in IJK, it calculates the minimum and maximum
 * coordinate in each axis, and returns them. If dimensions are provided it also
 * clip the min, max to the provided width, height and depth
 *
 * @param points - shape corner points coordinates (IJK)
 * @param dimensions - dimensions of the image
 * @returns [[xMin,xMax],[yMin,yMax], [zMin,zMax]]
 */
function getBoundingBoxAroundShape(
  points: Types.Point3[],
  dimensions?: Types.Point3
): [Types.Point2, Types.Point2, Types.Point2] {
  let xMin = Infinity;
  let xMax = 0;
  let yMin = Infinity;
  let yMax = 0;
  let zMin = Infinity;
  let zMax = 0;

  points.forEach((p) => {
    xMin = Math.min(p[0], xMin);
    xMax = Math.max(p[0], xMax);
    yMin = Math.min(p[1], yMin);
    yMax = Math.max(p[1], yMax);
    zMin = Math.min(p[2], zMin);
    zMax = Math.max(p[2], zMax);
  });

  xMin = Math.floor(xMin);
  xMax = Math.floor(xMax);
  yMin = Math.floor(yMin);
  yMax = Math.floor(yMax);
  zMin = Math.floor(zMin);
  zMax = Math.floor(zMax);

  if (dimensions) {
    // clip the min, max to the provided width, height and depth
    const [width, height, depth] = dimensions;
    xMin = Math.max(0, xMin);
    xMax = Math.min(width - 1, xMax);
    yMin = Math.max(0, yMin);
    yMax = Math.min(height - 1, yMax);
    zMin = Math.max(0, zMin);
    zMax = Math.min(depth - 1, zMax);
  }

  return [
    [xMin, xMax],
    [yMin, yMax],
    [zMin, zMax],
  ];
}

export default getBoundingBoxAroundShape;
