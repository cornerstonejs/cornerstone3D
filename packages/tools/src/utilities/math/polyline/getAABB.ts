import { Types } from '@cornerstonejs/core';

/**
 * Calculates the axis-aligned bounding box (AABB) of a polyline.
 *
 * @param polyline - The polyline represented as an array of points.
 * @param options - Additional options for calculating the AABB.
 * @param options.isWorld - Indicates whether the polyline represents points in 3D space (true) or 2D space (false).
 *
 * @returns The AABB of the polyline. If the polyline represents points in 3D space, returns an AABB3 object with properties minX, maxX, minY, maxY, minZ, and maxZ. If the polyline represents points in 2D space, returns an AABB2 object with properties minX, maxX, minY, and maxY.
 */
export default function getAABB(
  polyline: Types.Point2[] | Types.Point3[] | number[],
  options?: {
    numDimensions: number;
  }
): Types.AABB2 | Types.AABB3 {
  // need to check if the polyline is array of arrays or just
  // a flat array of numbers
  let polylineToUse = polyline;
  const numDimensions = options?.numDimensions || 2;
  const is3D = numDimensions === 3;

  if (!Array.isArray(polyline[0])) {
    const currentPolyline = polyline as number[];
    // check the isWorld flag is provided or not which means every
    // 3 elements in the array represent a point in 3D space
    // otherwise, every 2 elements in the array represent a point in 2D space
    const totalPoints = currentPolyline.length / numDimensions;

    polylineToUse = new Array(currentPolyline.length / numDimensions) as
      | Types.Point2[]
      | Types.Point3[];

    for (let i = 0, len = totalPoints; i < len; i++) {
      polylineToUse[i] = [
        currentPolyline[i * numDimensions],
        currentPolyline[i * numDimensions + 1],
      ];

      if (is3D) {
        polylineToUse[i].push(currentPolyline[i * numDimensions + 2]);
      }
    }
  }

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;

  polylineToUse = polylineToUse as Types.Point2[] | Types.Point3[];

  for (let i = 0, len = polylineToUse.length; i < len; i++) {
    const [x, y, z] = polylineToUse[i];

    // No Math.min/max calls for better performance
    minX = minX < x ? minX : x;
    minY = minY < y ? minY : y;
    maxX = maxX > x ? maxX : x;
    maxY = maxY > y ? maxY : y;

    if (is3D) {
      minZ = minZ < z ? minZ : z;
      maxZ = maxZ > z ? maxZ : z;
    }
  }

  return is3D
    ? { minX, maxX, minY, maxY, minZ, maxZ } // AABB3
    : { minX, maxX, minY, maxY }; // AABB2
}
