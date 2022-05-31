import type { Types } from '@cornerstonejs/core';

/**
 * Uses the current bounds of the 2D rectangle and extends it in the view axis by numSlices
 * It compares min and max of each IJK to find the view axis (for axial, zMin === zMax) and
 * then calculates the extended range. It will assume the slice is relative to the
 * current slice and will add the given slices to the current max of the boundingBox.
 * @param boundsIJK - [[iMin, iMax], [jMin, jMax], [kMin, kMax]]
 * @param slices - number of slices to project before and after
 * @returns extended bounds
 */
function extend2DBoundingBoxInViewAxis(
  boundsIJK: [Types.Point2, Types.Point2, Types.Point2],
  numSlicesToProject: number
): [Types.Point2, Types.Point2, Types.Point2] {
  // find which index in boundsIJK has the same first and last value
  const sliceNormalIndex = boundsIJK.findIndex(([min, max]) => min === max);

  if (sliceNormalIndex === -1) {
    throw new Error('3D bounding boxes not supported in an oblique plane');
  }

  // get the index and subtract slices from the min and add to the max
  boundsIJK[sliceNormalIndex][0] -= numSlicesToProject;
  boundsIJK[sliceNormalIndex][1] += numSlicesToProject;
  return boundsIJK;
}

export default extend2DBoundingBoxInViewAxis;
