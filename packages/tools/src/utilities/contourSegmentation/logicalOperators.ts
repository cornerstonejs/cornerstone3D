import type { Types } from '@cornerstonejs/core';
import { getAnnotation } from '../../stateManagement';
import type {
  Segmentation,
  ContourSegmentationData,
  ContourSegmentationAnnotation,
} from '../../types';
import {
  convertContourPolylineToCanvasSpace,
  convertContourPolylineToWorld,
} from './sharedOperations';
import { subtractPolylineSets, unifyPolylineSets } from './unifyPolylineSets';
import addPolylinesToSegmentation from './addPolylinesToSegmentation';

function getPolylines(
  contourRepresentationData: ContourSegmentationData,
  segmentIndex: number
) {
  // loop over all annotations in the segment and flatten their polylines
  const polylines = [];
  const { annotationUIDsMap } = contourRepresentationData;
  const annotationUIDs = annotationUIDsMap.get(segmentIndex);

  for (const annotationUID of annotationUIDs) {
    const annotation = getAnnotation(annotationUID);
    const { polyline } = (annotation as ContourSegmentationAnnotation).data
      .contour;
    polylines.push(polyline);
  }
  return polylines;
}

function extractPolylines(
  viewport: Types.IViewport,
  segmentation: Segmentation,
  segmentIndex1: number,
  segmentIndex2: number
) {
  if (!segmentation) {
    return;
  }

  if (!segmentation.representationData.Contour) {
    return;
  }

  const contourRepresentationData = segmentation.representationData
    .Contour as ContourSegmentationData;
  const { annotationUIDsMap } = contourRepresentationData;
  if (!annotationUIDsMap) {
    return;
  }

  if (!annotationUIDsMap.get(segmentIndex1)) {
    return;
  }

  if (!annotationUIDsMap.get(segmentIndex2)) {
    return;
  }

  const polyLines1 = getPolylines(contourRepresentationData, segmentIndex1);
  const polyLines2 = getPolylines(contourRepresentationData, segmentIndex2);

  const polyLinesCanvas1 = polyLines1.map((polyline) =>
    convertContourPolylineToCanvasSpace(polyline, viewport)
  );
  const polyLinesCanvas2 = polyLines2.map((polyline) =>
    convertContourPolylineToCanvasSpace(polyline, viewport)
  );
  return { polyLinesCanvas1, polyLinesCanvas2 };
}

export function addition(
  viewport: Types.IViewport,
  segmentation: Segmentation,
  segmentIndex1: number,
  segmentIndex2: number,
  { name, segmentIndex, color }
) {
  const { polyLinesCanvas1, polyLinesCanvas2 } =
    extractPolylines(viewport, segmentation, segmentIndex1, segmentIndex2) ||
    {};
  if (!polyLinesCanvas1 || polyLinesCanvas2) {
    return;
  }
  const polylinesMerged = unifyPolylineSets(polyLinesCanvas1, polyLinesCanvas2);
  const polyLinesWorld = polylinesMerged.map((polyline) =>
    convertContourPolylineToWorld(polyline, viewport)
  );
  const annotationUIDsMapNew = addPolylinesToSegmentation(
    viewport,
    segmentation.segmentationId,
    polyLinesWorld,
    segmentIndex
  );

  const contourRepresentationData = segmentation.representationData
    .Contour as ContourSegmentationData;
  const { annotationUIDsMap } = contourRepresentationData;
  if (!annotationUIDsMap) {
    return;
  }

  annotationUIDsMap.set(segmentIndex, annotationUIDsMapNew.get(segmentIndex));
}

export function subtraction(
  viewport: Types.IViewport,
  segmentation: Segmentation,
  segmentIndex1: number,
  segmentIndex2: number,
  { name, segmentIndex, color }
) {
  const { polyLinesCanvas1, polyLinesCanvas2 } =
    extractPolylines(viewport, segmentation, segmentIndex1, segmentIndex2) ||
    {};
  if (!polyLinesCanvas1 || polyLinesCanvas2) {
    return;
  }
  const polylinesMerged = subtractPolylineSets(
    polyLinesCanvas1,
    polyLinesCanvas2
  );
  const polyLinesWorld = polylinesMerged.map((polyline) =>
    convertContourPolylineToWorld(polyline, viewport)
  );

  const annotationUIDsMapNew = addPolylinesToSegmentation(
    viewport,
    segmentation.segmentationId,
    polyLinesWorld,
    segmentIndex
  );

  const contourRepresentationData = segmentation.representationData
    .Contour as ContourSegmentationData;
  const { annotationUIDsMap } = contourRepresentationData;
  if (!annotationUIDsMap) {
    return;
  }

  annotationUIDsMap.set(segmentIndex, annotationUIDsMapNew.get(segmentIndex));
}
