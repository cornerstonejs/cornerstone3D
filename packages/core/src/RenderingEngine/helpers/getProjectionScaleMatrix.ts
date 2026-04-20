import { mat4 } from 'gl-matrix';

/**
 * Computes the projection scaling matrix used for canvas stretch.
 * The scaling is applied along the canvas axes.
 *
 * @param aspectRatio - [scaleX, scaleY], where each value controls stretching along the corresponding canvas axis
 * @returns Projection scaling matrix for canvas stretch
 */
export function getProjectionScaleMatrix(aspectRatio: Array<number>): mat4 {
  const [scaleX, scaleY] = aspectRatio;

  const projectionScaleMatrix = mat4.fromScaling(mat4.create(), [
    scaleX,
    scaleY,
    1.0,
  ]);

  return projectionScaleMatrix;
}
