import { RENDERING_DEFAULTS } from '../constants';

/**
 * Resolves a slab depth in mm, and reports "no slab" as undefined.
 *
 * The caller supplies a **full** depth. The `slabThickness` of the
 * appearance of a planar viewport is a half thickness: a slab of `T` shows
 * the slices within about `T` of the plane on each side, as the legacy
 * `setSlabThickness(T)` did. Such a caller passes twice the value.
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
