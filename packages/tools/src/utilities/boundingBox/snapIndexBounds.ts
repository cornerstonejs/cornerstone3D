import type { Types } from '@cornerstonejs/core';

/**
 * Converts floating-point min/max index bounds to integer voxel indices.
 *
 * For planar annotations (delta <= 1), floating-point drift from world-to-index
 * conversion can map to adjacent slices. Collapsing to a single rounded index
 * keeps planar ROIs on the intended slice across viewport types.
 *
 * For bounds spanning multiple voxels (delta > 1), floor/ceil preserves coverage.
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
