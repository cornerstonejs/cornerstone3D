import { vec3 } from 'gl-matrix';

const EPSILON = 1e-6;

/**
 * Determine which projection-matrix indices to multiply for canvas X and Y scaling.
 * For each anatomical axis stretch work as follows
 * axial  => stretch in anterior-posterior
 * sagittal => stretch in superior-inferior
 * coronal  => stretch in superior-inferior
 * @param {Array<number>} viewUp - [ux, uy, uz] camera viewUp (patient-space)
 * @param {Array<number>} viewPlaneNormal - [dx, dy, dz] camera viewPlaneNormal (patient-space)
 * @returns {{ idxX: number, idxY: number}}
 */
export function getProjectionScaleIndices(viewUp, viewPlaneNormal) {
  const up = vec3.normalize(vec3.create(), viewUp);
  const vpn = vec3.normalize(vec3.create(), viewPlaneNormal);

  // Image axes in patient space
  // Right-hand coordinate system: imageX = up × vpn
  const imageX = vec3.create();
  vec3.cross(imageX, up, vpn);
  if (vec3.length(imageX) < EPSILON) {
    // Fallback: if up and vpn are nearly parallel, create an orthogonal axis
    const tmp =
      Math.abs(up[0]) < 1 / Math.sqrt(2) // Use 45 degree to find the nearest isometric axis
        ? vec3.fromValues(1, 0, 0)
        : vec3.fromValues(0, 1, 0);
    vec3.cross(imageX, tmp, up);
  }
  vec3.normalize(imageX, imageX);
  const imageY = up;

  // Determine anatomical orientation (axial/sagittal/coronal)
  const absVpn = [Math.abs(vpn[0]), Math.abs(vpn[1]), Math.abs(vpn[2])];
  let orientation = 'axial';
  if (absVpn[0] === Math.max(...absVpn)) {
    orientation = 'sagittal';
  } else if (absVpn[1] === Math.max(...absVpn)) {
    orientation = 'coronal';
  }

  // Determine which anatomical axis to stretch
  const AY = vec3.fromValues(0, 1, 0); // A-P
  const AZ = vec3.fromValues(0, 0, 1); // S-I
  const target = orientation === 'axial' ? AY : AZ;

  // Which image axis (X or Y) aligns better with target?
  const scoreX = Math.abs(vec3.dot(imageX, target));
  const scoreY = Math.abs(vec3.dot(imageY, target));

  // Choose projection-matrix diagonal indices
  // 0 - scale X (horizontal)
  // 5 - scale Y (vertical)
  let [idxX, idxY] = [0, 5];
  // If target aligns with horizontal, swap so vertical scaling follows rotation
  if (scoreX > scoreY) {
    [idxX, idxY] = [5, 0];
  }

  return { idxX, idxY };
}
