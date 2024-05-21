import type { Types } from '@cornerstonejs/core';
import { CONSTANTS } from '@cornerstonejs/core';

const { EPSILON } = CONSTANTS;

/** Bounding box type */
type BoundingBox =
  | [Types.Point2, Types.Point2, null]
  | [Types.Point2, Types.Point2, Types.Point2];

function calculateBoundingBox(
  points,
  dimensions,
  isWorld = false
): BoundingBox {
  let xMin = Infinity;
  let xMax = isWorld ? -Infinity : 0;
  let yMin = Infinity;
  let yMax = isWorld ? -Infinity : 0;
  let zMin = Infinity;
  let zMax = isWorld ? -Infinity : 0;

  const is3D = points[0]?.length === 3;

  // use for loop for performance
  for (let i = 0; i < points.length; i++) {
    const p = points[i];
    xMin = Math.min(p[0], xMin);
    xMax = Math.max(p[0], xMax);
    yMin = Math.min(p[1], yMin);
    yMax = Math.max(p[1], yMax);

    if (is3D) {
      zMin = Math.min(p[2] ?? zMin, zMin);
      zMax = Math.max(p[2] ?? zMax, zMax);
    }
  }

  if (dimensions) {
    xMin = Math.max(isWorld ? dimensions[0] + EPSILON : 0, xMin);
    xMax = Math.min(
      isWorld ? dimensions[0] - EPSILON : dimensions[0] - 1,
      xMax
    );
    yMin = Math.max(isWorld ? dimensions[1] + EPSILON : 0, yMin);
    yMax = Math.min(
      isWorld ? dimensions[1] - EPSILON : dimensions[1] - 1,
      yMax
    );

    if (is3D && dimensions.length === 3) {
      zMin = Math.max(isWorld ? dimensions[2] + EPSILON : 0, zMin);
      zMax = Math.min(
        isWorld ? dimensions[2] - EPSILON : dimensions[2] - 1,
        zMax
      );
    }
  } else if (!isWorld) {
    // still need to bound to 0 and Infinity if no dimensions are provided for ijk
    xMin = Math.max(0, xMin);
    xMax = Math.min(Infinity, xMax);
    yMin = Math.max(0, yMin);
    yMax = Math.min(Infinity, yMax);

    if (is3D) {
      zMin = Math.max(0, zMin);
      zMax = Math.min(Infinity, zMax);
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

/**
 * With a given vertices (points) coordinates in 2D or 3D in IJK, it calculates the minimum and maximum
 * coordinate in each axis, and returns them. If clipBounds are provided it also
 * clip the min, max to the provided width, height and depth
 *
 * @param points - shape corner points coordinates either in IJK (image coordinate)
 * @param dimensions - bounds to clip the min, max
 * @returns [[xMin,xMax],[yMin,yMax], [zMin,zMax]]
 */
export function getBoundingBoxAroundShapeIJK(
  points: Types.Point2[] | Types.Point3[],
  dimensions?: Types.Point2 | Types.Point3
): BoundingBox {
  return calculateBoundingBox(points, dimensions, false);
}

/**
 * With a given vertices (points) coordinates in 2D or 3D in World Coordinates, it calculates the minimum and maximum
 * coordinate in each axis, and returns them. If clipBounds are provided it also
 * clip the min, max to the provided width, height and depth
 *
 * @param points - shape corner points coordinates either in IJK (image coordinate)
 * @param clipBounds - bounds to clip the min, max
 * @returns [[xMin,xMax],[yMin,yMax], [zMin,zMax]]
 */
export function getBoundingBoxAroundShapeWorld(
  points: Types.Point2[] | Types.Point3[],
  clipBounds?: Types.Point2 | Types.Point3
): BoundingBox {
  return calculateBoundingBox(points, clipBounds, true);
}
