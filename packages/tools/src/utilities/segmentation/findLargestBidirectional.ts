import { vec3 } from 'gl-matrix';

import { createIsInSegment, isLineInSegment } from './isLineInSegment';
import type { BidirectionalData } from './createBidirectionalToolData';

const EPSILON = 1e-2;

/**
 * Search in the contours for the given segment to find the largest bidirectional
 * that will fit entirely within the slice contours inside the contours object.
 * Assumptions/implementation details:
 *
 *   1. The major and minor bidirectional lines must not cross the contour
 *   2. The center point for both major and minor bidirectional lines must be
 *      within the segment, or the contained segment index.
 *   3. The major/minor axis must be orthogonal
 *
 * Note this does NOT test that the major/minor axis intersect.  Normally they will, but
 * it isn't a hard requirement.
 *
 * The way that islands within the contours are handled is to allow the island to be
 * coloured with something that is contained - that way both open and closed islands
 * can be handled correctly for finding the bidirectional  (an open island is a section
 * inside the segment that is open to the outside - this can happen at bone endpoints or when
 * one region flows into another)
 */
export default function findLargestBidirectional(
  contours,
  segVolumeId: string,
  segment
) {
  const { sliceContours } = contours;
  const { segmentIndex, containedSegmentIndices } = segment;
  let maxBidirectional;
  const isInSegment = createIsInSegment(
    segVolumeId,
    segmentIndex,
    containedSegmentIndices
  );
  for (const sliceContour of sliceContours) {
    const bidirectional = createBidirectionalForSlice(
      sliceContour,
      isInSegment,
      maxBidirectional
    );
    if (!bidirectional) {
      continue;
    }
    maxBidirectional = bidirectional;
  }
  if (maxBidirectional) {
    Object.assign(maxBidirectional, segment);
  }
  return maxBidirectional;
}

/**
 * This function creates a bidirectional data object for the given slice and
 * slice contour, only when the major distance is larger than currentMax, or
 * equal to current max and the minor is larger than currentMax's minor.
 * It does this by looking at every pair of distances in sliceCountour to find
 * those larger than the currentMax, and then finds the minor distance for those
 * major distances.
 *
 */
export function createBidirectionalForSlice(
  sliceContour,
  isInSegment,
  currentMax = { maxMajor: 0, maxMinor: 0 }
) {
  const { points } = sliceContour.polyData;
  const { maxMinor: currentMaxMinor, maxMajor: currentMaxMajor } = currentMax;
  let maxMajor = currentMaxMajor * currentMaxMajor;
  let maxMinor = currentMaxMinor * currentMaxMinor;
  let maxMajorPoints;
  for (let index1 = 0; index1 < points.length; index1++) {
    for (let index2 = index1 + 1; index2 < points.length; index2++) {
      const point1 = points[index1];
      const point2 = points[index2];
      const distance2 = vec3.sqrDist(point1, point2);
      if (distance2 < maxMajor) {
        continue;
      }
      if (distance2 - EPSILON < maxMajor + EPSILON && maxMajorPoints) {
        // Consider adding to the set of points rather than continuing here
        // so that all minor axis can be tested
        continue;
      }
      if (!isInSegment.testCenter(point1, point2)) {
        // Center between the two points has to be in the segment, otherwise
        // this is out of bounds.
        continue;
      }
      if (!isLineInSegment(point1, point2, isInSegment)) {
        // If the line intersects the segment boundary, then skip it
        continue;
      }
      maxMajor = distance2 - EPSILON;
      maxMajorPoints = [index1, index2];
      maxMinor = 0;
    }
  }
  if (!maxMajorPoints) {
    return;
  }

  maxMajor = Math.sqrt(maxMajor + EPSILON);
  const handle0 = points[maxMajorPoints[0]];
  const handle1 = points[maxMajorPoints[1]];
  const unitMajor = vec3.sub(vec3.create(), handle0, handle1);
  vec3.scale(unitMajor, unitMajor, 1 / maxMajor);

  let maxMinorPoints;

  for (let index1 = 0; index1 < points.length; index1++) {
    for (let index2 = index1 + 1; index2 < points.length; index2++) {
      const point1 = points[index1];
      const point2 = points[index2];
      const distance2 = vec3.sqrDist(point1, point2);
      if (distance2 <= maxMinor) {
        continue;
      }
      const delta = vec3.sub(vec3.create(), point1, point2);

      const dot = Math.abs(vec3.dot(delta, unitMajor)) / Math.sqrt(distance2);
      if (dot > EPSILON) {
        continue;
      }

      if (!isInSegment.testCenter(point1, point2)) {
        // Center between the two points has to be in the segment, otherwise
        // this is out of bounds.
        continue;
      }
      if (!isLineInSegment(point1, point2, isInSegment)) {
        continue;
      }
      maxMinor = distance2;
      maxMinorPoints = [index1, index2];
    }
  }

  if (!maxMinorPoints) {
    // Didn't find a larger minor distance
    return;
  }
  maxMinor = Math.sqrt(maxMinor);
  const handle2 = points[maxMinorPoints[0]];
  const handle3 = points[maxMinorPoints[1]];

  const bidirectional = {
    majorAxis: [handle0, handle1],
    minorAxis: [handle2, handle3],
    maxMajor,
    maxMinor,
    ...sliceContour,
  } as BidirectionalData;
  return bidirectional;
}
