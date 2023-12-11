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

  return findLargestBidirectional(contours[0]);
}

function findLargestBidirectional(contours) {
  const { sliceContours } = contours;
  let maxBidirectional;
  console.time('generateBidirectional');
  for (const sliceContour of sliceContours) {
    const bidirectional = createBidirectionalForSlice(
      sliceContour,
      maxBidirectional
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

function createBidirectionalForSlice(sliceContour, currentMax) {
  const { points } = sliceContour.polyData;
  let maxMajor = 0;
  let maxMajorPoints = [0, 1];
  for (let i = 0; i < points.length; i++) {
    for (let j = i + 1; j < points.length; j++) {
      const pointI = points[i];
      const pointJ = points[j];
      const distance = vec3.distance(pointI, pointJ);
      if (distance > maxMajor) {
        maxMajor = distance;
        maxMajorPoints = [i, j];
      }
    }
  }
  if (maxMajor < currentMax) {
    return;
  }
  const handle0 = points[maxMajorPoints[0]];
  const handle1 = points[maxMajorPoints[1]];
  const majorDelta = vec3.sub(vec3.create(), handle0, handle1);

  let maxMinor = 0;
  let maxMinorPoints = [0, 0];

  for (let i = 0; i < points.length; i++) {
    for (let j = i + 1; j < points.length; j++) {
      const delta = vec3.sub(vec3.create(), points[i], points[j]);
      const distance = vec3.distance(points[i], points[j]);
      const dot = Math.abs(vec3.dot(delta, majorDelta)) / distance / maxMajor;
      if (dot > EPSILON) {
        continue;
      }
      if (distance > maxMinor) {
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
