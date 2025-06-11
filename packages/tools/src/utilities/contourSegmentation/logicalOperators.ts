import type { Types } from '@cornerstonejs/core';
import { getAnnotation, removeAnnotation } from '../../stateManagement';
import type {
  ContourSegmentationData,
  ContourSegmentationAnnotation,
} from '../../types';
import {
  convertContourPolylineToCanvasSpace,
  convertContourPolylineToWorld,
} from './sharedOperations';
import {
  intersectPolylinesSets,
  subtractPolylineSets,
  unifyPolylineSets,
  xorPolylinesSets,
} from './unifyPolylineSets';
import addPolylinesToSegmentation from './addPolylinesToSegmentation';
import { getSegmentation } from '../../stateManagement/segmentation/getSegmentation';
import { copyContourSegment } from './copyAnnotation';
import { removeContourSegmentationAnnotation } from './removeContourSegmentationAnnotation';
import { getViewportAssociatedToSegmentation } from './getViewportAssociatedToSegmentation';

export type SegmentInfo = {
  segmentationId: string;
  segmentIndex: number;
  label?: string;
  color?: string;
};

export type OperatorOptions = SegmentInfo;
export enum LogicalOperation {
  Union,
  Subtract,
  Intersect,
  XOR,
  Copy,
  Delete,
}

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

function applyLogicalOperation(
  segment1: SegmentInfo,
  segment2: SegmentInfo,
  options: OperatorOptions,
  operation: LogicalOperation
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
    case LogicalOperation.Union:
      polylinesMerged = unifyPolylineSets(polyLinesCanvas1, polyLinesCanvas2);
      break;
    case LogicalOperation.Subtract:
      polylinesMerged = subtractPolylineSets(
        polyLinesCanvas1,
        polyLinesCanvas2
      );
      break;
    case LogicalOperation.Intersect:
      polylinesMerged = intersectPolylinesSets(
        polyLinesCanvas1,
        polyLinesCanvas2
      );
      break;
    case LogicalOperation.XOR:
      polylinesMerged = xorPolylinesSets(polyLinesCanvas1, polyLinesCanvas2);
      break;
    default:
      polylinesMerged = unifyPolylineSets(polyLinesCanvas1, polyLinesCanvas2);
      break;
  }
  const polyLinesWorld = polylinesMerged.map((polyline) =>
    convertContourPolylineToWorld(polyline, viewport)
  );

  const resultSegment = options;
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
  applyLogicalOperation(segment1, segment2, options, LogicalOperation.Union);
}

export function subtract(
  segment1: SegmentInfo,
  segment2: SegmentInfo,
  options: OperatorOptions
) {
  applyLogicalOperation(segment1, segment2, options, LogicalOperation.Subtract);
}

export function intersect(
  segment1: SegmentInfo,
  segment2: SegmentInfo,
  options: OperatorOptions
) {
  applyLogicalOperation(
    segment1,
    segment2,
    options,
    LogicalOperation.Intersect
  );
}

export function xor(
  segment1: SegmentInfo,
  segment2: SegmentInfo,
  options: OperatorOptions
) {
  applyLogicalOperation(segment1, segment2, options, LogicalOperation.XOR);
}

export function copy(segment: SegmentInfo, options: OperatorOptions) {
  copyContourSegment(
    segment.segmentationId,
    segment.segmentIndex,
    options.segmentationId,
    options.segmentIndex
  );
}

export function deleteOperation(segment: SegmentInfo) {
  const segmentation = getSegmentation(segment.segmentationId);
  if (!segmentation) {
    console.log('No active segmentation detected');
    return;
  }

  if (!segmentation.representationData.Contour) {
    console.log('No contour representation found');
    return;
  }

  const representationData = segmentation.representationData.Contour;
  const { annotationUIDsMap } = representationData;
  if (!annotationUIDsMap) {
    console.log('No annotation map found');
    return;
  }

  if (!annotationUIDsMap.has(segment.segmentIndex)) {
    console.log('Segmentation index has no annotations');
    return;
  }

  const annotationUIDList = annotationUIDsMap.get(segment.segmentIndex);
  annotationUIDList.forEach((annotationUID) => {
    const annotation = getAnnotation(annotationUID);
    removeAnnotation(annotationUID);
    removeContourSegmentationAnnotation(
      annotation as ContourSegmentationAnnotation
    );
  });
}

// cornerstoneTools.segmentation.operators.not(
//   { segmentationId: string, segmentIndex: number },
//   options?: OperatorOptions
// )
