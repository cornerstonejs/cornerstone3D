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

  return findLargestBidirectional(
    contours[0],
    segVolumeId,
    segments.findIndex((it) => !!it)
  );
}

function createIsInSegment(segVolumeId: string, segment: number) {
  // Get segmentation volume
  const vol = cache.getVolume(segVolumeId);
  if (!vol) {
    console.warn(`No volume found for ${segVolumeId}`);
    return;
  }

  const numSlices = vol.dimensions[2];

  const segData = vol.imageData.getPointData().getScalars().getData();
  const width = vol.dimensions[0];
  const pixelsPerSlice = width * vol.dimensions[1];

  return (point) => {
    const ijk = vol.imageData.worldToIndex(point).map(Math.round);
    const [i, j, k] = ijk;
    const index = i + j * width + k * pixelsPerSlice;
    const value = segData[index];
    return value === segment;
  };
}

function findLargestBidirectional(contours, segVolumeId, segment) {
  const { sliceContours } = contours;
  let maxBidirectional;
  console.time('generateBidirectional');
  const isInSegment = createIsInSegment(segVolumeId, segment);
  for (const sliceContour of sliceContours) {
    const bidirectional = createBidirectionalForSlice(
      sliceContour,
      maxBidirectional,
      isInSegment
    );
    if (!bidirectional) {
      continue;
    }
    if (
      !maxBidirectional ||
      maxBidirectional.maxMajor < bidirectional.maxMajor ||
      (maxBidirectional.maxMajor === bidirectional.maxMajor &&
        maxBidirectional.maxMinor < bidirectional.maxMinor)
    ) {
      maxBidirectional = bidirectional;
    }
  }
  console.timeEnd('generateBidirectional');
  return maxBidirectional;
}

/**
 * Determines if there is a point in points other than pointI or pointJ which
 * is on the line between I and J.
 */
function isCrossing(points, pointI, pointJ, distance) {
  for (const point of points) {
    if (point === pointI || point === pointJ) {
      continue;
    }
    const delta1 = vec3.sub(vec3.create(), pointI, point);
    const delta2 = vec3.sub(vec3.create(), point, pointJ);
    const length1 = vec3.length(delta1);
    const length2 = vec3.length(delta2);
    // Use a distance of half a mm for "on the line"
    if (Math.abs(distance - length1 - length2) < 0.5) {
      return true;
    }
  }
  return false;
}

function createBidirectionalForSlice(sliceContour, currentMax, isInSegment) {
  const { points } = sliceContour.polyData;
  let maxMajor = 0;
  let maxMajorPoints = [0, 1];
  for (let i = 0; i < points.length; i++) {
    for (let j = i + 1; j < points.length; j++) {
      const pointI = points[i];
      const pointJ = points[j];
      const distance = vec3.distance(pointI, pointJ);
      if (distance > maxMajor) {
        if (isCrossing(points, pointI, pointJ, distance)) {
          continue;
        }
        const pointCenter = vec3.scale(
          vec3.create(),
          vec3.add(vec3.create(), pointI, pointJ),
          0.5
        );
        if (!isInSegment(pointCenter)) {
          // Center between the two points has to be in the segment, otherwise
          // this is out of bounds.
          continue;
        }
        maxMajor = distance;
        maxMajorPoints = [i, j];
      }
    }
  }
  if (maxMajor === 0 || maxMajor < currentMax) {
    return;
  }
  const handle0 = points[maxMajorPoints[0]];
  const handle1 = points[maxMajorPoints[1]];
  const majorDelta = vec3.sub(vec3.create(), handle0, handle1);

  let maxMinor = 0;
  let maxMinorPoints = [0, 0];

  for (let i = 0; i < points.length; i++) {
    for (let j = i + 1; j < points.length; j++) {
      const pointI = points[i];
      const pointJ = points[j];
      const delta = vec3.sub(vec3.create(), pointI, pointJ);
      const distance = vec3.distance(pointI, pointJ);
      const dot = Math.abs(vec3.dot(delta, majorDelta)) / distance / maxMajor;
      if (dot > EPSILON) {
        continue;
      }
      if (distance > maxMinor) {
        if (isCrossing(points, pointI, pointJ, distance)) {
          continue;
        }
        const pointCenter = vec3.scale(
          vec3.create(),
          vec3.add(vec3.create(), pointI, pointJ),
          0.5
        );
        if (!isInSegment(pointCenter)) {
          // Center between the two points has to be in the segment, otherwise
          // this is out of bounds.
          continue;
        }
        maxMinor = distance;
        maxMinorPoints = [i, j];
      }
    }
  }

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
