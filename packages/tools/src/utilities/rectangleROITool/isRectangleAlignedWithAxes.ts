import { vec3 } from 'gl-matrix';
import { utilities as csUtils } from '@cornerstonejs/core';

/**
 * Determines whether a given rectangle in a 3D space (defined by its corner
 * points in IJK coordinates) is aligned with the IJK axes.
 * @param rectangleCornersIJK - The corner points of the rectangle in IJK coordinates
 * @returns True if the rectangle is aligned with the IJK axes, false otherwise
 */
function isRectangleAlignedWithAxes(rectangleCornersIJK) {
  const iAxis = [1, 0, 0];
  const jAxis = [0, 1, 0];
  const kAxis = [0, 0, 1];

  function calculateVector(pointA, pointB) {
    return [
      pointB[0] - pointA[0],
      pointB[1] - pointA[1],
      pointB[2] - pointA[2],
    ];
  }

  // Calculate vectors for two edges of the rectangle
  const rectangleVec1 = calculateVector(
    rectangleCornersIJK[0],
    rectangleCornersIJK[1]
  );
  const rectangleVec2 = calculateVector(
    rectangleCornersIJK[0],
    rectangleCornersIJK[2]
  );

  // Function to calculate angle with IJK axes
  function calculateAnglesWithAxes(vec, axes) {
    return axes.map((axis) => (vec3.angle(vec, axis) * 180) / Math.PI);
  }

  // Calculate the angles with IJK axes for both vectors
  const anglesVec1 = calculateAnglesWithAxes(rectangleVec1, [
    iAxis,
    jAxis,
    kAxis,
  ]);
  const anglesVec2 = calculateAnglesWithAxes(rectangleVec2, [
    iAxis,
    jAxis,
    kAxis,
  ]);

  // Check if all angles are aligned (0, 90, 180, or 270 degrees)
  const isAligned = [...anglesVec1, ...anglesVec2].every(
    (angle) =>
      csUtils.isEqual(angle, 0) ||
      csUtils.isEqual(angle, 90) ||
      csUtils.isEqual(angle, 180) ||
      csUtils.isEqual(angle, 270)
  );

  return isAligned;
}

export { isRectangleAlignedWithAxes };
