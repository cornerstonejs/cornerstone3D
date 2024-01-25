import { utilities as csUtils } from '@cornerstonejs/core';
import { vec3 } from 'gl-matrix';

import { ContourAnnotation } from '../../types/ToolSpecificAnnotationTypes';

const { isEqual } = csUtils;

/**
 * Finds the index in the polyline of the specified handle.  If the handle
 * doesn't match a polyline point, then finds the closest polyline point.
 *
 * Assumes polyline is in the same orientation as the handles.
 *
 * @param annotation - to find the polyline and handles in
 * @param handleIndex - the index of hte handle to look for.
 *     Negative values are treated relative to the end of the handle index.
 * @returns Index in polyline of the closest handle
 *     * 0 for handleIndex 0
 *     * length for `handleIndex===handles length`
 */
export default function findHandlePolylineIndex(
  annotation: ContourAnnotation,
  handleIndex: number
): number {
  const { polyline } = annotation.data.contour;
  const { points } = annotation.data.handles;
  const { length } = points;
  if (handleIndex === length) {
    return polyline.length;
  }
  if (handleIndex < 0) {
    handleIndex = (handleIndex + length) % length;
  }
  if (handleIndex === 0) {
    return 0;
  }
  const handle = points[handleIndex];
  const index = polyline.findIndex((point) => isEqual(handle, point));
  if (index !== -1) {
    return index;
  }
  // Need to find nearest
  let closestDistance = Infinity;
  return polyline.reduce((closestIndex, point, testIndex) => {
    const distance = vec3.squaredDistance(point, handle);
    if (distance < closestDistance) {
      closestDistance = distance;
      return testIndex;
    }
    return closestIndex;
  }, -1);
}
