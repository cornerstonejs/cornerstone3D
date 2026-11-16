import { vec3 } from 'gl-matrix';
import type { IImageVolume, Point3 } from '../types';

type VolumeGeometry = Pick<
  IImageVolume,
  'direction' | 'dimensions' | 'spacing'
>;

/**
 * The volume axis (0, 1 or 2) that a unit view plane normal follows, or
 * `undefined` for an oblique plane.
 *
 * The tilt of the normal from the axis must move the plane by less than half a
 * voxel of that axis across the extent of the volume in the plane. A plane
 * that follows an axis then crosses one voxel slice of that axis everywhere in
 * the volume. Either direction of the axis counts. The planar viewport draws
 * its full-resolution slices of a reduced volume by this rule.
 */
export function alignedVolumeAxis(
  imageVolume: VolumeGeometry,
  viewPlaneNormal: Point3
): number | undefined {
  const { direction, dimensions, spacing } = imageVolume;

  for (let axis = 0; axis < 3; axis++) {
    const axisVector = vec3.fromValues(
      direction[axis * 3],
      direction[axis * 3 + 1],
      direction[axis * 3 + 2]
    );
    const cos = Math.abs(
      vec3.dot(axisVector, viewPlaneNormal as unknown as vec3)
    );
    const sin = Math.sqrt(Math.max(0, 1 - cos * cos));
    const [a, b] = [0, 1, 2].filter((other) => other !== axis);
    const halfDiagonal =
      Math.hypot(dimensions[a] * spacing[a], dimensions[b] * spacing[b]) / 2;

    if (sin * halfDiagonal < spacing[axis] / 2) {
      return axis;
    }
  }
}

/**
 * Whether a view plane normal shows the acquisition plane of a volume: the
 * normal follows the scan axis by the rule of {@link alignedVolumeAxis}. The
 * planar viewport draws the acquired frames of a reduced volume by this rule,
 * so a caller that asks "is this view in the acquisition plane" gets the same
 * answer as the render.
 *
 * The 0.99 tolerance of `VolumeViewport.isInAcquisitionPlane` is wider, and it
 * still decides whether a reference to an image counts as the view.
 */
export function isAcquisitionPlaneNormal(
  imageVolume: VolumeGeometry,
  viewPlaneNormal: Point3
): boolean {
  return alignedVolumeAxis(imageVolume, viewPlaneNormal) === 2;
}
