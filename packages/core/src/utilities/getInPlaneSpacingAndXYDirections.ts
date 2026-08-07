import type { mat3 } from 'gl-matrix';
import { vec3 } from 'gl-matrix';
import type { Point2, Point3 } from '../types';
import getSpacingInNormalDirection from './getSpacingInNormalDirection';

const EPSILON = 1e-3;

/**
 * Given an image's `direction` matrix and voxel `spacing`, plus the in-plane
 * viewport axes (`viewRight` and `viewUp`), returns the in-plane voxel spacing
 * and the world-space directions of the x (right) and y (up) axes.
 *
 * - Fast path (orthogonal): when an in-plane axis is parallel to a volume axis,
 *   that axis's spacing and direction are returned exactly.
 * - Oblique: the in-plane axis is not parallel to any volume axis, so the
 *   voxel-sized spacing along that direction is computed by projecting the
 *   volume spacing onto it (the same measure `getSpacingInNormalDirection`
 *   uses), and the in-plane axis itself is returned as the direction.
 *
 * This is the shared geometry behind both the planar freehand area calculation
 * (`getSubPixelSpacingAndXYDirections`) and in-plane voxel iteration.
 *
 * @param imageData - An object exposing the image `direction` matrix and voxel
 * `spacing`.
 * @param viewRight - The in-plane x (right) axis in world space, normalized.
 * @param viewUp - The in-plane y (up) axis in world space, normalized.
 * @returns The x/y in-plane spacing and the world-space x/y directions.
 */
export default function getInPlaneSpacingAndXYDirections(
  imageData: { direction: mat3 | number[]; spacing: Point3 },
  viewRight: Point3,
  viewUp: Point3
): { spacing: Point2; xDir: Point3; yDir: Point3 } {
  const { direction, spacing } = imageData;

  const iVector = direction.slice(0, 3) as Point3;
  const jVector = direction.slice(3, 6) as Point3;
  const kVector = direction.slice(6, 9) as Point3;

  // Resolve the voxel spacing and world direction for one in-plane axis. A dot
  // product magnitude of ~1 means the in-plane axis is (anti)parallel to a
  // volume axis, which lets us return that axis's spacing exactly. Otherwise
  // the plane is oblique and we project the volume spacing onto the axis.
  const resolveAxis = (axis: Point3): { spacing: number; dir: Point3 } => {
    const absDotI = Math.abs(vec3.dot(axis as vec3, iVector as vec3));
    const absDotJ = Math.abs(vec3.dot(axis as vec3, jVector as vec3));
    const absDotK = Math.abs(vec3.dot(axis as vec3, kVector as vec3));

    if (Math.abs(1 - absDotI) < EPSILON) {
      return { spacing: spacing[0], dir: iVector };
    }
    if (Math.abs(1 - absDotJ) < EPSILON) {
      return { spacing: spacing[1], dir: jVector };
    }
    if (Math.abs(1 - absDotK) < EPSILON) {
      return { spacing: spacing[2], dir: kVector };
    }

    // Oblique: voxel-sized spacing along this arbitrary in-plane direction.
    const dir = vec3.normalize(vec3.create(), axis as vec3) as Point3;
    const obliqueSpacing = getSpacingInNormalDirection(
      { direction: direction as mat3, spacing },
      dir
    );

    return { spacing: obliqueSpacing, dir };
  };

  const x = resolveAxis(viewRight);
  const y = resolveAxis(viewUp);

  return {
    spacing: [x.spacing, y.spacing],
    xDir: x.dir,
    yDir: y.dir,
  };
}
