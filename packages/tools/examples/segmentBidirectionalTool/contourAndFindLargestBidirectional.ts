import { cache } from '@cornerstonejs/core';
import { adaptersRT } from '@cornerstonejs/adapters';
import * as cornerstoneTools from '@cornerstonejs/tools';

import vtkImageMarchingSquares from '@kitware/vtk.js/Filters/General/ImageMarchingSquares';
import vtkDataArray from '@kitware/vtk.js/Common/Core/DataArray';
import vtkImageData from '@kitware/vtk.js/Common/DataModel/ImageData';
import { vec3 } from 'gl-matrix';

const vtkUtils = {
  vtkImageMarchingSquares,
  vtkDataArray,
  vtkImageData,
};

const EPSILON = 1e-2;

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
  const { generateContourSetsFromLabelmap } = adaptersRT.Cornerstone3D.RTSS;

  console.time('contour');
  const contours = generateContourSetsFromLabelmap({
    segmentations,
    cornerstoneCache: cache,
    cornerstoneToolsEnums: cornerstoneTools.Enums,
    vtkUtils,
  });
  console.timeEnd('contour');

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
  const { Labelmap } = cornerstoneTools.Enums.SegmentationRepresentations;
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

  /**
   * Find the center point between point1 and point2, convert it to IJK space
   * and test if the value at that location is in the segment
   */
  return (point1, point2) => {
    const point = vec3.add(vec3.create(), point1, point2).map((it) => it / 2);
    const ijk = vol.imageData.worldToIndex(point as vec3).map(Math.round);
    const [i, j, k] = ijk;
    const index = i + j * width + k * pixelsPerSlice;
    const value = segData[index];
    return value === segmentIndex || containedSegmentIndices?.has(value);
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
    const startTimeMs = Date.now();
    const bidirectional = createBidirectionalForSlice(
      sliceContour,
      maxBidirectional,
      isInSegment
    );
    const durationMs = Date.now() - startTimeMs;
    if (!bidirectional) {
      if (durationMs > 250) {
        console.log('Skipped slice bidirectional took', durationMs);
      }
      continue;
    }
    maxBidirectional = bidirectional;
    if (durationMs > 250) {
      console.log('Slice bidirectional calculation took', durationMs);
    }
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
 * Determines if there is a point in points other than point1 or point2 which
 * is on the line (or nearly so, to deal with quantization issues) between them.
 * The algorithm used is to compare the distances between point1 and the test point
 * and between the test point and point2 to see if they add up to distance, and
 * are thus a straight line.
 * point1 must be contained in the points list as an object instance
 * point2 may be contained in the points list as an object instance
 *
 * Note, skips points before point1 in the index
 */
function isCrossing(
  points,
  point1Index,
  point2Index,
  distance,
  point1Lengths: Map<number, number>
) {
  const point1 = points[point1Index];
  const point2 = points[point2Index];
  const pointsLength = points.length;
  for (let testIndex = 0; testIndex < pointsLength; testIndex++) {
    if (testIndex === point1Index || testIndex === point2Index) {
      continue;
    }
    const point = points[testIndex];
    const point1Length = point1Lengths.get(testIndex);
    const length1 = point1Length ?? vec3.distance(point1, point);
    if (point1Length === undefined) {
      point1Lengths.set(testIndex, length1);
    }
    // Storing the additional lengths for point2 becomes quite expensive,
    // in terms of memory, so probably not worth doing right now.
    const length2 = vec3.distance(point, point2);
    if (Math.abs(distance - length1 - length2) < 5 * EPSILON) {
      return true;
    }
  }
  return false;
}

function createBidirectionalForSlice(sliceContour, currentMax, isInSegment) {
  const { points } = sliceContour.polyData;
  const { maxMinor: currentMaxMinor, maxMajor: currentMaxMajor } =
    currentMax || { maxMajor: 0, maxMinor: 0 };
  let maxMajor = currentMaxMajor * currentMaxMajor;
  let maxMinor = currentMaxMinor * currentMaxMinor;
  let maxMajorPoints;
  for (let index1 = 0; index1 < points.length; index1++) {
    const point1Distances = new Map<number>();
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
      if (!isInSegment(point1, point2)) {
        // Center between the two points has to be in the segment, otherwise
        // this is out of bounds.
        continue;
      }
      const distance = point1Distances.get(index2) ?? Math.sqrt(distance2);
      if (isCrossing(points, index1, index2, distance, point1Distances)) {
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
  const majorDelta = vec3.sub(vec3.create(), handle0, handle1);
  majorDelta.forEach((it, index) => (majorDelta[index] = it / maxMajor));

  let maxMinorPoints;

  for (let i = 0; i < points.length; i++) {
    for (let j = i + 1; j < points.length; j++) {
      const pointI = points[i];
      const pointJ = points[j];
      const distance2 = distanceSq(pointI, pointJ);
      if (distance2 <= maxMinor) {
        continue;
      }
      const distance = Math.sqrt(distance2);
      const delta = vec3.sub(vec3.create(), pointI, pointJ);

      const dot = Math.abs(vec3.dot(delta, majorDelta)) / distance;
      if (dot > EPSILON) {
        continue;
      }
      if (!isInSegment(pointI, pointJ)) {
        // Center between the two points has to be in the segment, otherwise
        // this is out of bounds.
        continue;
      }
      if (isCrossing(points, pointI, pointJ, distance)) {
        continue;
      }
      maxMinor = distance2;
      maxMinorPoints = [i, j];
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
    handle0,
    handle1,
    handle2,
    handle3,
    maxMajor,
    maxMinor,
    ...sliceContour,
  };
  return bidirectional;
}
