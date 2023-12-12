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

  const { representationData, segments = [0, 1] } = segmentations;
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

function createIsInSegment(segVolumeId: string, segment: number) {
  // Get segmentation volume
  const vol = cache.getVolume(segVolumeId);
  if (!vol) {
    console.warn(`No volume found for ${segVolumeId}`);
    return;
  }

  const segData = vol.imageData.getPointData().getScalars().getData();
  const width = vol.dimensions[0];
  const pixelsPerSlice = width * vol.dimensions[1];

  return (pointI, pointJ) => {
    const point = vec3.add(vec3.create(), pointI, pointJ).map((it) => it / 2);
    const ijk = vol.imageData.worldToIndex(point as vec3).map(Math.round);
    const [i, j, k] = ijk;
    const index = i + j * width + k * pixelsPerSlice;
    const value = segData[index];
    return value === segment;
  };
}

function findLargestBidirectional(contours, segVolumeId, segment) {
  const { sliceContours } = contours;
  const { segmentIndex } = segment;
  let maxBidirectional;
  const isInSegment = createIsInSegment(segVolumeId, segmentIndex);
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
 * Determines if there is a point in points other than pointI or pointJ which
 * is on the line between I and J.
 */
function isCrossing(points, pointI, pointJ, distance) {
  for (const point of points) {
    if (point === pointI || point === pointJ) {
      continue;
    }
    const length1 = vec3.distance(pointI, point);
    const length2 = vec3.distance(point, pointJ);
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
  for (let i = 0; i < points.length; i++) {
    for (let j = i + 1; j < points.length; j++) {
      const pointI = points[i];
      const pointJ = points[j];
      const distance2 = distanceSq(pointI, pointJ);
      if (distance2 < maxMajor) {
        continue;
      }
      if (distance2 === maxMajor && maxMajorPoints) {
        // Consider adding to the set of points rather than continuing here
        // so that all minor axis can be tested
        continue;
      }
      if (!isInSegment(pointI, pointJ)) {
        // Center between the two points has to be in the segment, otherwise
        // this is out of bounds.
        continue;
      }
      const distance = Math.sqrt(distance2);
      if (isCrossing(points, pointI, pointJ, distance)) {
        // If the line intersects the segment boundary, then skip it
        continue;
      }
      maxMajor = distance2;
      maxMajorPoints = [i, j];
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
