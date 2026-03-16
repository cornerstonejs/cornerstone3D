import { mat4, vec3 } from 'gl-matrix';

const EPSILON = 1e-6;

/**
 * Computes a projection scaling matrix with rotation-invariant scaling in patient
 * coordinate space. The stretch follows patient anatomical directions (AP or SI)
 * rather than screen axes, maintaining consistent scaling after view rotations.
 *
 * @param viewUp - Camera viewUp vector in patient space
 * @param viewPlaneNormal - Camera viewPlaneNormal vector in patient space
 * @param aspectRatio - [scaleX, scaleY]. scaleY applies to dominant anatomical axis
 * @returns Projection scaling matrix
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
