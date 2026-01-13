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
export function getProjectionScaleMatrix(
  viewUp: vec3,
  viewPlaneNormal: vec3,
  aspectRatio: Array<number>
): mat4 {
  // Normalize inputs
  const up = vec3.normalize(vec3.create(), viewUp);
  const vpn = vec3.normalize(vec3.create(), viewPlaneNormal);

  // Screen Right axis (RH system: Up × Normal)
  const viewRight = vec3.create();
  vec3.cross(viewRight, up, vpn);

  // Fallback if Up and Normal are nearly parallel
  if (vec3.length(viewRight) < EPSILON) {
    // Select a non-parallel basis vector
    const tmp =
      Math.abs(up[0]) < 1 / Math.sqrt(2)
        ? vec3.fromValues(1, 0, 0)
        : vec3.fromValues(0, 1, 0);
    vec3.cross(viewRight, tmp, up);
  }
  vec3.normalize(viewRight, viewRight);
  const [scaleX, scaleY] = aspectRatio;

  // Project patient anatomical axes onto view plane to determine stretch direction
  const projectToPlane = (axis: vec3) => {
    const dot = vec3.dot(axis, vpn);
    const projection = vec3.create();
    vec3.scaleAndAdd(projection, axis, vpn, -dot);
    return projection;
  };

  const projY = projectToPlane(vec3.fromValues(0, 1, 0));
  const projZ = projectToPlane(vec3.fromValues(0, 0, 1));

  // Use most visible anatomical axis as stretch direction
  const stretchAxis = vec3.length(projY) > vec3.length(projZ) ? projY : projZ;
  vec3.normalize(stretchAxis, stretchAxis);

  // Scale based on alignment: aligned -> scaleY, perpendicular -> scaleX
  function getScaleFactor(screenVec: vec3): number {
    const alignment = Math.abs(vec3.dot(screenVec, stretchAxis));
    return alignment * scaleY + (1 - alignment) * scaleX;
  }

  const out = mat4.create();
  return mat4.fromScaling(out, [
    getScaleFactor(viewRight),
    getScaleFactor(up),
    1.0,
  ]);
}
