import { Types } from '@cornerstonejs/core';
import getFirstLineSegmentIntersectionIndexes from './getFirstLineSegmentIntersectionIndexes';

/**
 * Check if two polylines intersect comparing line segment by line segment.
 * @param sourcePolyline - Source polyline
 * @param targetPolyline - Target polyline
 * @returns True if the polylines intersect or false otherwise
 */
export default function intersectPolyline(
  sourcePolyline: Types.Point2[],
  targetPolyline: Types.Point2[]
): boolean {
  // Naive way to detect intersection between polylines in O(n^2).
  // TODO: Implement Bentley Ottmann sweep line algorithm or maybe some
  // algorithm that uses r-tree may make it run faster
  for (let i = 0, sourceLen = sourcePolyline.length; i < sourceLen; i++) {
    const sourceP1 = sourcePolyline[i];
    const sourceP2Index = i === sourceLen - 1 ? 0 : i + 1;
    const sourceP2 = sourcePolyline[sourceP2Index];

    const intersectionPointIndexes = getFirstLineSegmentIntersectionIndexes(
      targetPolyline,
      sourceP1,
      sourceP2
    );

    if (intersectionPointIndexes?.length === 2) {
      return true;
    }
  }

  return false;
}
