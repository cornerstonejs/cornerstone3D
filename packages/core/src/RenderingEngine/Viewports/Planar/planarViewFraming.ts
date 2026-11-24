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

export function applyPlanarViewFlip(args: {
  flipHorizontal?: boolean;
  flipVertical?: boolean;
  viewPlaneNormal: Point3;
  viewUp: Point3;
}): {
  viewPlaneNormal: Point3;
  viewUp: Point3;
} {
  const { flipHorizontal, flipVertical, viewPlaneNormal, viewUp } = args;
  const shouldFlipNormal = Boolean(flipHorizontal) !== Boolean(flipVertical);

  return {
    viewPlaneNormal: shouldFlipNormal
      ? (vec3.negate(
          vec3.create(),
          viewPlaneNormal as unknown as vec3
        ) as Point3)
      : ([...viewPlaneNormal] as Point3),
    viewUp: flipVertical
      ? (vec3.negate(vec3.create(), viewUp as unknown as vec3) as Point3)
      : ([...viewUp] as Point3),
  };
}

/**
 * The rotation about the view plane normal of a planar view before its flips
 * (`rotatePlanarViewUp`, then `applyPlanarViewFlip`) that gives the view up
 * of the 5.x viewports, which flipped first and then turned about the normal
 * of the flipped view. With exactly one flip that normal points the other
 * way, so the rotation is 360 minus the rotation. So a positive rotation
 * turns the picture clockwise on the screen with any flips, and the rotation
 * of a view is measured about the normal that it shows.
 */
export function getPlanarRotationBeforeFlips(args: {
  rotation?: number;
  flipHorizontal?: boolean;
  flipVertical?: boolean;
}): number {
  const rotation = normalizePlanarRotation(args.rotation ?? 0);

  return Boolean(args.flipHorizontal) !== Boolean(args.flipVertical)
    ? normalizePlanarRotation(-rotation)
    : rotation;
}

/**
 * The rotation of a planar view after a change of its flips that comes
 * without a rotation, so that the picture is mirrored on the screen, as the
 * 5.x flip, `setCamera` and view setter mirrored it: each flip that
 * changes turns the rotation to 360 minus the rotation.
 *
 * @param current - The rotation and the flips of the view now.
 * @param next - The flips of the view after the change.
 */
export function getPlanarRotationAfterFlips(
  current: {
    rotation?: number;
    flipHorizontal?: boolean;
    flipVertical?: boolean;
  },
  next: { flipHorizontal?: boolean; flipVertical?: boolean }
): number {
  const rotation = normalizePlanarRotation(current.rotation ?? 0);
  const changes =
    Number(
      (current.flipHorizontal === true) !== (next.flipHorizontal === true)
    ) +
    Number((current.flipVertical === true) !== (next.flipVertical === true));

  return changes % 2 ? normalizePlanarRotation(-rotation) : rotation;
}
