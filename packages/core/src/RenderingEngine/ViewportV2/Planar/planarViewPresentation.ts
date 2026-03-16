import { mat4, vec3 } from 'gl-matrix';
import type { Point3 } from '../../../types';

export function normalizePlanarRotation(rotation = 0): number {
  return ((rotation % 360) + 360) % 360;
}

export function rotatePlanarViewUp(args: {
  rotation?: number;
  viewPlaneNormal: Point3;
  viewUp: Point3;
}): Point3 {
  const { rotation = 0, viewPlaneNormal, viewUp } = args;
  const normalizedRotation = normalizePlanarRotation(rotation);

  if (normalizedRotation === 0) {
    return [...viewUp] as Point3;
  }

  const rotationMatrix = mat4.fromRotation(
    mat4.create(),
    (normalizedRotation * Math.PI) / 180,
    viewPlaneNormal as unknown as vec3
  );

  return vec3.transformMat4(
    vec3.create(),
    viewUp as unknown as vec3,
    rotationMatrix
  ) as Point3;
}
