import { vec3 } from 'gl-matrix';
import type { Types } from '@cornerstonejs/core';

/**
 * Given two world positions and an orthogonal view to an `imageVolume` defined
 * by a `viewPlaneNormal` and a `viewUp`, get the width and height in world coordinates
 * of the rectangle defined by the two points. The implementation works both with orthogonal
 * non-orthogonal rectangles.
 *
 * @param viewPlaneNormal - The normal of the view.
 * @param viewUp - The up direction of the view.
 * @param imageVolume - The imageVolume to use to measure.
 * @param topLeftWorld - The first world position.
 * @param bottomRightWorld - The second world position.
 *
 * @returns The `worldWidth` and `worldHeight`.
 */
export default function getWorldWidthAndHeightFromCorners(
  viewPlaneNormal: Types.Point3,
  viewUp: Types.Point3,
  topLeftWorld: Types.Point3,
  bottomRightWorld: Types.Point3
): { worldWidth: number; worldHeight: number } {
  const viewRight = vec3.create();

  vec3.cross(viewRight, <vec3>viewUp, <vec3>viewPlaneNormal);

  const pos1 = vec3.fromValues(...topLeftWorld);
  const pos2 = vec3.fromValues(...bottomRightWorld);

  const diagonal = vec3.create();
  vec3.subtract(diagonal, pos1, pos2);

  const diagonalLength = vec3.length(diagonal);

  // When the two points are very close to each other return width as 0
  // to avoid NaN the cosTheta formula calculation
  if (diagonalLength < 0.0001) {
    return { worldWidth: 0, worldHeight: 0 };
  }

  const cosTheta =
    vec3.dot(diagonal, viewRight) / (diagonalLength * vec3.length(viewRight));

  const sinTheta = Math.sqrt(1 - cosTheta * cosTheta);

  const worldWidth = sinTheta * diagonalLength;
  const worldHeight = cosTheta * diagonalLength;

  return { worldWidth, worldHeight };
}
