import { cache } from '@cornerstonejs/core';
import type { Types } from '@cornerstonejs/core';
import { vec3 } from 'gl-matrix';

import { generateContourSetsFromLabelmap } from '../rtstruct';
import SegmentationRepresentations from '../../enums/SegmentationRepresentations';

export type BidirectionalData = {
  majorAxis: [Types.Point3, Types.Point3];
  minorAxis: [Types.Point3, Types.Point3];
  maxMajor: number;
  maxMinor: number;
  segmentIndex: number;
  label?: string;
  color?: string | number[];
  referencedImageId: string;
  FrameOfReferenceUID: string;
};

const EPSILON = 1e-2;
const { Labelmap } = SegmentationRepresentations;

/**
 * Generates a contour object over the segment, and then uses the contouring to
 * find the largest bidirectional object that can be applied within the acquisition
 * plane that is within the segment index, or the contained segment indices.
 *
 * @param segmentations.segments - a list of segments to apply the contour to.
 * @param segmentations.segments.containedSegmentIndices - a set of segment indexes equivalent to the primary segment
 * @param segmentations.segments.label - the label for the segment
 * @param segmentations.segments.color - the color to use for the segment label
 */
export default function contourAndFindLargestBidirectional(segmentations) {
  const contours = generateContourSetsFromLabelmap({
    segmentations,
  });

  if (!contours?.length || !contours[0].sliceContours.length) {
    return;
  }

  const {
    representationData,
    segments = [
      null,
      { label: 'Unspecified', color: null, containedSegmentIndices: null },
    ],
  } = segmentations;
  const { volumeId: segVolumeId } = representationData[Labelmap];

  const segmentIndex = segments.findIndex((it) => !!it);
  if (segmentIndex === -1) {
    return;
  }
  segments[segmentIndex].segmentIndex = segmentIndex;
  return findLargestBidirectional(
    contours[0],
    segVolumeId,
    segments[segmentIndex]
  );
}

/**
 * Creates a function that tests to see if the provided line segment, specified
 * in LPS space (as endpoints) is contained in the segment
 */
function createIsInSegment(
  segVolumeId: string,
  segmentIndex: number,
  containedSegmentIndices?: Set<number>
) {
  // Get segmentation volume
  const vol = cache.getVolume(segVolumeId);
  if (!vol) {
    console.warn(`No volume found for ${segVolumeId}`);
    return;
  }

  const segData = vol.imageData.getPointData().getScalars().getData();
  const width = vol.dimensions[0];
  const pixelsPerSlice = width * vol.dimensions[1];

  return {
    /**
     * Find the center point between point1 and point2, convert it to IJK space
     * and test if the value at that location is in the segment
     */
    testCenter: (point1, point2) => {
      const point = vec3.add(vec3.create(), point1, point2).map((it) => it / 2);
      const ijk = vol.imageData.worldToIndex(point as vec3).map(Math.round);
      const [i, j, k] = ijk;
      const index = i + j * width + k * pixelsPerSlice;
      const value = segData[index];
      return value === segmentIndex || containedSegmentIndices?.has(value);
    },

    toIJK: (point) => vol.imageData.worldToIndex(point as vec3),

    testIJK: (ijk) => {
      const [i, j, k] = ijk;
      const index =
        Math.round(i) + Math.round(j) * width + Math.round(k) * pixelsPerSlice;
      const value = segData[index];
      return value === segmentIndex || containedSegmentIndices?.has(value);
    },
  };
}

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
function findLargestBidirectional(contours, segVolumeId: string, segment) {
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

const lengthSq = (point) =>
  point[0] * point[0] + point[1] * point[1] + point[2] * point[2];

const distanceSq = (p1, p2) => lengthSq(vec3.sub(vec3.create(), p1, p2));

/**
 * Determines if there is a point between point1 and point2 which is not
 * contained in the segmentation
 */
function isLineInSegment(
  point1: Types.Point3,
  point2: Types.Point3,
  isInSegment
) {
  const ijk1 = isInSegment.toIJK(point1);
  const ijk2 = isInSegment.toIJK(point2);
  const testPoint = vec3.create();
  const { testIJK } = isInSegment;
  const delta = vec3.sub(vec3.create(), ijk1, ijk2);

  // Test once for index value between the two points, so the max of the
  // difference in IJK values
  const testSize = Math.round(Math.max(...delta.map(Math.abs)));
  if (testSize < 2) {
    // No need to test when there are only two points
    return true;
  }
  const unitDelta = vec3.scale(vec3.create(), delta, 1 / testSize);

  for (let i = 1; i < testSize; i++) {
    vec3.scaleAndAdd(testPoint, ijk2, unitDelta, i);
    if (!testIJK(testPoint)) {
      return false;
    }
  }
  return true;
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
function createBidirectionalForSlice(
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
      const distance2 = distanceSq(point1, point2);
      if (distance2 < maxMajor) {
        continue;
      }
      if (distance2 === maxMajor && maxMajorPoints) {
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
      maxMajor = distance2;
      maxMajorPoints = [index1, index2];
      maxMinor = 0;
    }
  }
  if (!maxMajorPoints) {
    return;
  }

  maxMajor = Math.sqrt(maxMajor);
  const handle0 = points[maxMajorPoints[0]];
  const handle1 = points[maxMajorPoints[1]];
  const unitMajor = vec3.sub(vec3.create(), handle0, handle1);
  vec3.scale(unitMajor, unitMajor, 1 / maxMajor);

  let maxMinorPoints;

  for (let index1 = 0; index1 < points.length; index1++) {
    for (let index2 = index1 + 1; index2 < points.length; index2++) {
      const point1 = points[index1];
      const point2 = points[index2];
      const distance2 = distanceSq(point1, point2);
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
