import type { Types } from '@cornerstonejs/core';

type ellipsoid = {
  center: [number, number, number];
  width: number;
  height: number;
  depth: number;
};

/**
 * Checks whether the point is inside the provided ellipse with constraint of a plane (viewPlane).
 * @param ellipse - ellipse object including {center, width, height, depth}
 * @param point - [x,y,z] of the point
 * @param viewPlane - camera viewPlane
 * @returns whether the point is inside the ellipse
 */
export default function pointInEllipsoidWithConstraint(
  ellipsoid: ellipsoid,
  point: Types.Point3,
  viewPlane: Types.Point3 // constraint
) {
  // Todo: This implementation should be used for oblique planes segmentation tools
  // but still not a priority
  // const { center, width, height, depth } = ellipsoid
  // const [x, y, z] = point
  // const [x0, y0, z0] = center
  // const inside =
  //   ((x - x0) * (x - x0)) / (width * width) +
  //     ((y - y0) * (y - y0)) / (height * height) +
  //     ((z - z0) * (z - z0)) / (depth * depth) <=
  //   1
  // const onPlane =
  //   Math.abs(n1 * (x - x0) + n2 * (y - y0) + n3 * (z - z0)) <= 1e-3
  // return inside
}
