import type { Types } from '@cornerstonejs/core';
import extend2DBoundingBoxInViewAxis from './extend2DBoundingBoxInViewAxis';

export function extendBoundingBoxInSliceAxisIfNecessary(
  boundsIJK: [Types.Point2, Types.Point2, Types.Point2],
  numSlicesToProject: number
): [Types.Point2, Types.Point2, Types.Point2] {
  const extendedBoundsIJK = extend2DBoundingBoxInViewAxis(
    boundsIJK,
    numSlicesToProject
  );
  return extendedBoundsIJK;
}

export default extendBoundingBoxInSliceAxisIfNecessary;
