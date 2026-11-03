import { vec3 } from 'gl-matrix';
import type { IImageVolume, Point3 } from '../types';

/**
 * Whether a view plane normal shows the acquisition plane of a volume.
 *
 * The tilt of the normal from the scan axis must move the plane by less than
 * half a slice across the in-plane extent of the volume. The planar viewport
 * draws the acquired frames of a reduced volume by this rule, so a caller that
 * asks "is this view in the acquisition plane" gets the same answer as the
 * render. Either direction of the scan axis counts.
 *
 * The 0.99 tolerance of `VolumeViewport.isInAcquisitionPlane` is wider, and it
 * still decides whether a reference to an image counts as the view.
 */
export function isAcquisitionPlaneNormal(
  imageVolume: Pick<IImageVolume, 'direction' | 'dimensions' | 'spacing'>,
  viewPlaneNormal: Point3
): boolean {
  const { direction, dimensions, spacing } = imageVolume;
  const scanAxis = vec3.fromValues(direction[6], direction[7], direction[8]);
  const cos = Math.abs(vec3.dot(scanAxis, viewPlaneNormal as unknown as vec3));
  const sin = Math.sqrt(Math.max(0, 1 - cos * cos));
  const halfDiagonal =
    Math.hypot(dimensions[0] * spacing[0], dimensions[1] * spacing[1]) / 2;

  return sin * halfDiagonal < spacing[2] / 2;
}

export default isAcquisitionPlaneNormal;
