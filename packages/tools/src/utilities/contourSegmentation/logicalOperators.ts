import { getEnabledElementByViewportId, type Types } from '@cornerstonejs/core';
import { getAnnotation } from '../../stateManagement';
import type {
  ContourSegmentationData,
  ContourSegmentationAnnotation,
} from '../../types';
import {
  convertContourPolylineToCanvasSpace,
  convertContourPolylineToWorld,
} from './sharedOperations';
import {
  intersectPolylines,
  subtractPolylineSets,
  unifyPolylineSets,
  xorPolylinesSets,
} from './unifyPolylineSets';
import addPolylinesToSegmentation from './addPolylinesToSegmentation';
import { getSegmentation } from '../../stateManagement/segmentation/getSegmentation';
import { getViewportIdsWithSegmentation } from '../../stateManagement/segmentation/getViewportIdsWithSegmentation';

export type SegmentInfo = {
  segmentationId: string;
  segmentIndex: number;
  label?: string;
  color?: string;
};

export type OperatorOptions = {
  resultSegment: SegmentInfo;
};

function getPolylines(
  contourRepresentationData: ContourSegmentationData,
  segmentIndex: number
) {
  // loop over all annotations in the segment and flatten their polylines
  const polylines = [];
  const { annotationUIDsMap } = contourRepresentationData || {};
  if (!annotationUIDsMap?.has(segmentIndex)) {
    return;
  }
  const annotationUIDs = annotationUIDsMap.get(segmentIndex);

  for (const annotationUID of annotationUIDs) {
    const annotation = getAnnotation(annotationUID);
    const { polyline } = (annotation as ContourSegmentationAnnotation).data
      .contour;
    polylines.push(polyline);
  }
  return polylines;
}

function extractPolylinesInCanvasSpace(
  viewport: Types.IViewport,
  segment1: SegmentInfo,
  segment2: SegmentInfo
) {
  const segmentation1 = getSegmentation(segment1.segmentationId);
  const segmentation2 = getSegmentation(segment2.segmentationId);
  if (!segmentation1 || !segmentation2) {
    return;
  }

  if (
    !segmentation1.representationData.Contour ||
    !segmentation2.representationData.Contour
  ) {
    return;
  }

  const polyLines1 = getPolylines(
    segmentation1.representationData.Contour,
    segment1.segmentIndex
  );
  const polyLines2 = getPolylines(
    segmentation2.representationData.Contour,
    segment2.segmentIndex
  );

  if (!polyLines1 || !polyLines2) {
    return;
  }

  const polyLinesCanvas1 = polyLines1.map((polyline) =>
    convertContourPolylineToCanvasSpace(polyline, viewport)
  );
  const polyLinesCanvas2 = polyLines2.map((polyline) =>
    convertContourPolylineToCanvasSpace(polyline, viewport)
  );
  return { polyLinesCanvas1, polyLinesCanvas2 };
}

function addSegmentInSegmentation(
  segmentation,
  { segmentIndex, label, color }
) {
  if (!segmentation?.segments) {
    return;
  }
  segmentation.segments[segmentIndex] = {
    active: false,
    locked: false,
    label,
    segmentIndex,
    cachedStats: {},
    color,
  };
}

function getViewportAssociatedToSegmentation(segmentationId: string) {
  const viewportIds = getViewportIdsWithSegmentation(segmentationId);
  if (viewportIds?.length === 0) {
    return;
  }
  const { viewport } = getEnabledElementByViewportId(viewportIds[0]) || {};
  return viewport;
}

function applyLogicalOperation(
  segment1: SegmentInfo,
  segment2: SegmentInfo,
  options: OperatorOptions,
  operation: number = 1
) {
  const viewport = getViewportAssociatedToSegmentation(segment1.segmentationId);
  if (!viewport) {
    return;
  }

  const { polyLinesCanvas1, polyLinesCanvas2 } =
    extractPolylinesInCanvasSpace(viewport, segment1, segment2) || {};
  if (!polyLinesCanvas1 || !polyLinesCanvas2) {
    return;
  }
  let polylinesMerged;
  switch (operation) {
    case 1:
      polylinesMerged = unifyPolylineSets(polyLinesCanvas1, polyLinesCanvas2);
      break;
    case 2:
      polylinesMerged = subtractPolylineSets(
        polyLinesCanvas1,
        polyLinesCanvas2
      );
      break;
    case 3:
      polylinesMerged = intersectPolylines(polyLinesCanvas1, polyLinesCanvas2);
      break;
    case 4:
      polylinesMerged = xorPolylinesSets(polyLinesCanvas1, polyLinesCanvas2);
      break;
  }
  const polyLinesWorld = polylinesMerged.map((polyline) =>
    convertContourPolylineToWorld(polyline, viewport)
  );

  const resultSegment = options.resultSegment;
  const segmentation = getSegmentation(resultSegment.segmentationId);
  const segmentIndex = resultSegment.segmentIndex;
  const color = resultSegment.color;
  const label = resultSegment.label;
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
  addSegmentInSegmentation(segmentation, { segmentIndex, color, label });
}

export function add(
  segment1: SegmentInfo,
  segment2: SegmentInfo,
  options: OperatorOptions
) {
  applyLogicalOperation(segment1, segment2, options, 1);
}

export function subtraction(
  segment1: SegmentInfo,
  segment2: SegmentInfo,
  options: OperatorOptions
) {
  applyLogicalOperation(segment1, segment2, options, 2);
}

export function intersect(
  segment1: SegmentInfo,
  segment2: SegmentInfo,
  options: OperatorOptions
) {
  applyLogicalOperation(segment1, segment2, options, 3);
}

export function xor(
  segment1: SegmentInfo,
  segment2: SegmentInfo,
  options: OperatorOptions
) {
  applyLogicalOperation(segment1, segment2, options, 4);
}

// cornerstoneTools.segmentation.operators.not(
//   { segmentationId: string, segmentIndex: number },
//   options?: OperatorOptions
// )
