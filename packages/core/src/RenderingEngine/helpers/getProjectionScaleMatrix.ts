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
  const [scaleX, scaleY] = aspectRatio;

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
  if (vec3.length(stretchAxis) < 0.001) return mat4.create();
  vec3.normalize(stretchAxis, stretchAxis);

  // Compute the sine and cosine, of the angle between the screen-up direction and the patient's axis.
  const cosTheta = vec3.dot(up, stretchAxis);
  const sinTheta = vec3.dot(viewRight, stretchAxis);

  // Create a 2D Rotation Matrix (R)
  const rotation = mat4.fromValues(
    cosTheta,
    sinTheta,
    0,
    0,
    -sinTheta,
    cosTheta,
    0,
    0,
    0,
    0,
    1,
    0,
    0,
    0,
    0,
    1
  );

  // Create the inverse rotation (transpose) (R_inv)
  const rotationInv = mat4.create();
  mat4.transpose(rotationInv, rotation);

  // Create the pure Scaling Matrix (S)
  const scaling = mat4.fromScaling(mat4.create(), [scaleX, scaleY, 1.0]);

  // Result = R_inv * S * R
  const temp = mat4.create();
  const out = mat4.create();
  mat4.multiply(temp, rotationInv, scaling);
  mat4.multiply(out, temp, rotation);

  return out;
}
