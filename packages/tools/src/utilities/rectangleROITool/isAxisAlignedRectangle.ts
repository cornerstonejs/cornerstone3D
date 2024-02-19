import { vec3 } from 'gl-matrix';
import { utilities as csUtils } from '@cornerstonejs/core';

const { isEqual } = csUtils;

const iAxis = vec3.fromValues(1, 0, 0);
const jAxis = vec3.fromValues(0, 1, 0);
const kAxis = vec3.fromValues(0, 0, 1);

const axisList = [iAxis, jAxis, kAxis];

/**
 * Determines whether a given rectangle in a 3D space (defined by its corner
 * points in IJK coordinates) is aligned with the IJK axes.
 * @param rectangleCornersIJK - The corner points of the rectangle in IJK coordinates
 * @returns True if the rectangle is aligned with the IJK axes, false otherwise
 */
function isAxisAlignedRectangle(rectangleCornersIJK) {
  const rectangleVec1 = vec3.subtract(
    vec3.create(),
    rectangleCornersIJK[0],
    rectangleCornersIJK[1]
  );

  const rectangleVec2 = vec3.subtract(
    vec3.create(),
    rectangleCornersIJK[0],
    rectangleCornersIJK[2]
  );

  // Calculate the angles with IJK axes for both vectors
  const anglesVec1 = calculateAnglesWithAxes(rectangleVec1, axisList);
  const anglesVec2 = calculateAnglesWithAxes(rectangleVec2, axisList);

  // Check if all angles are aligned (0, 90, 180, or 270 degrees)
  // we could do csUtils.isEqual(angle % 90, 0) but this is more explicit for reading
  const isAligned = [...anglesVec1, ...anglesVec2].every(
    (angle) =>
      isEqual(angle, 0) ||
      isEqual(angle, 90) ||
      isEqual(angle, 180) ||
      isEqual(angle, 270)
  );

  return isAligned;
}

// Function to calculate angle with IJK axes
function calculateAnglesWithAxes(vec, axes) {
  return axes.map((axis) => (vec3.angle(vec, axis) * 180) / Math.PI);
}

export { isAxisAlignedRectangle };
