import type { Types } from '@cornerstonejs/core';

/**
 * Converts floating-point min/max index bounds to integer voxel indices.
 *
 * For planar annotations (delta ≤ 1), floating-point drift from world-to-index
 * conversion can map to adjacent slices. Collapsing to a single rounded index
 * keeps planar ROIs on the intended slice across viewport types.
 *
 * For bounds spanning multiple voxels (delta > 1), floor/ceil preserves coverage.
 *
 * @deprecated No caller in this repository uses this function any more, and it
 * is removed in the next release. The area annotation tools select their
 * voxels with `utilities.sampleAreaAnnotationVoxels`, which derives the index
 * bounds from the annotation's own plane and thickness. A slice index that
 * this function rounded is a symptom of bounds taken from the display; take
 * the bounds from the annotation instead.
 */
function snapIndexBounds(min: number, max: number): Types.Point2 {
  const delta = max - min;

  if (delta <= 1) {
    const index = Math.round((min + max) / 2);

    return [index, index];
  }

  return [Math.floor(min), Math.ceil(max)];
}

export default snapIndexBounds;
