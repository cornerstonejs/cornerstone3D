import { mat4, vec3 } from 'gl-matrix';

const EPSILON = 1e-6;

/**
 * Computes a projection scaling matrix that adaptively blends aspect ratios
 * based on the alignment of screen axes with patient anatomical directions.
 *
 * @param viewUp - [ux, uy, uz] camera viewUp (patient-space)
 * @param viewPlaneNormal - [dx, dy, dz] camera viewPlaneNormal (patient-space)
 * @param aspectRatio - [scaleX, scaleY].
 * @returns Projection scaling matrix.
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

  // Blend scale based on anatomical axis alignment
  function getScaleFactor(screenVec: vec3): number {
    // SI (Z) and AP (Y) alignment
    const alignmentZ = Math.abs(vec3.dot(screenVec, vec3.fromValues(0, 0, 1)));
    const alignmentY = Math.abs(vec3.dot(screenVec, vec3.fromValues(0, 1, 0)));

    // Axial view: use AP, otherwise SI
    const absVpn = [Math.abs(vpn[0]), Math.abs(vpn[1]), Math.abs(vpn[2])];
    const isAxial = Math.abs(vpn[2]) === Math.max(...absVpn);
    const alignFactor = isAxial ? alignmentY : alignmentZ;

    return alignFactor * scaleY + (1 - alignFactor) * scaleX;
  }

  // Apply scaling to Right (X) and Up (Y)
  const out = mat4.create();
  return mat4.fromScaling(out, [
    getScaleFactor(viewRight),
    getScaleFactor(up),
    1.0,
  ]);
}
