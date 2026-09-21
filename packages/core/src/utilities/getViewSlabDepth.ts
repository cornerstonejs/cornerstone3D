import { RENDERING_DEFAULTS } from '../constants';

/**
 * Resolves a slab depth in mm, and reports "no slab" as undefined.
 *
 * The caller supplies a **full** depth, and the two render paths reach that
 * depth differently:
 *
 * - A volume viewport stores a half thickness, because
 *   `setOrientationOfClippingPlanes` puts the two clipping planes at
 *   `focalPoint ± slabThickness`. Such a caller passes `getSlabThickness() * 2`.
 * - A generic planar viewport uses `vtkImageResliceMapper`, where the field is
 *   already a full thickness. Such a caller passes the value as it is.
 *
 * A depth at or below twice `RENDERING_DEFAULTS.MINIMUM_SLAB_THICKNESS` means
 * "no slab was requested", and not "a slab of 0.1 mm was requested". A literal
 * 0.1 mm is thinner than any real voxel, so undefined lets the caller fall back
 * to one voxel along the normal.
 *
 * See `docs/docs/concepts/cornerstone-tools/annotation/voxel-statistics.md`.
 *
 * @param depth - The full depth the viewport shows, in mm.
 * @returns The depth, or undefined when the viewport shows no slab of its own.
 */
export default function getViewSlabDepth(
  depth: number | undefined | null
): number | undefined {
  if (
    !Number.isFinite(depth) ||
    (depth as number) <= RENDERING_DEFAULTS.MINIMUM_SLAB_THICKNESS * 2
  ) {
    return undefined;
  }

  return depth as number;
}
