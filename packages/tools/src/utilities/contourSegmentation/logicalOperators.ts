/**
 * Logical and set operations for polylines in Cornerstone3D's contour segmentation utilities.
 *
 * This module provides functions to perform union, subtraction, intersection, and XOR operations
 * on sets of polylines, where each polyline is associated with a view reference (PolylineInfoCanvas).
 * The logical operator pipeline is designed to propagate view references through all operations,
 * ensuring that annotations are placed in the correct view. UI responsiveness and controls are also
 * managed based on the selected operation.
 *
 * Key Types:
 * - SegmentInfo: Information about a segment (segmentationId, segmentIndex, label, color)
 * - OperatorOptions: Alias for SegmentInfo, used for operation options
 * - LogicalOperation: Enum for supported logical operations
 * - PolylineInfoWorld: { polyline: Point3[], viewReference }
 * - PolylineInfoCanvas: { polyline: Point2[], viewReference }
 *
 * Main Functions:
 * - add, subtract, intersect, xor: Perform the respective logical operation between two segments
 * - copy, deleteOperation: Copy or delete a segment
 * - applyLogicalOperation: Internal function to apply a logical operation and update the segmentation
 *
 * Helper Functions:
 * - getPolylinesInfoWorld: Gets world-space polylines and view references for a segment
 * - extractPolylinesInCanvasSpace: Converts world-space polylines to canvas space for two segments
 * - addSegmentInSegmentation: Adds a new segment to the segmentation object
 */

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
import addPolylinesToSegmentation from './addPolylinesToSegmentation';
import { getSegmentation } from '../../stateManagement/segmentation/getSegmentation';
import { copyContourSegment } from './copyAnnotation';
import { removeContourSegmentationAnnotation } from './removeContourSegmentationAnnotation';
import { getViewportAssociatedToSegmentation } from '../../stateManagement/segmentation/utilities/getViewportAssociatedToSegmentation';
import { unifyPolylineSets } from './polylineUnify';
import { subtractPolylineSets } from './polylineSubtract';
import { intersectPolylinesSets } from './polylineIntersect';
import { xorPolylinesSets } from './polylineXor';
import type { PolylineInfoWorld } from './polylineInfoTypes';
import { getViewReferenceFromAnnotation } from './getViewReferenceFromAnnotation';

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

/**
 * Retrieves all polylines (in world space) and their view references for a given segment.
 * @param contourRepresentationData The contour segmentation data
 * @param segmentIndex The segment index
 * @returns Array of PolylineInfoWorld or undefined
 */
function getPolylinesInfoWorld(
  contourRepresentationData: ContourSegmentationData,
  segmentIndex: number
): PolylineInfoWorld[] | undefined {
  // loop over all annotations in the segment and flatten their polylines
  const polylinesInfo = [];
  const { annotationUIDsMap } = contourRepresentationData || {};
  if (!annotationUIDsMap?.has(segmentIndex)) {
    return;
  }
  const annotationUIDs = annotationUIDsMap.get(segmentIndex);

  for (const annotationUID of annotationUIDs) {
    const annotation = getAnnotation(
      annotationUID
    ) as ContourSegmentationAnnotation;
    const { polyline } = annotation.data.contour;
    polylinesInfo.push({
      polyline,
      viewReference: getViewReferenceFromAnnotation(annotation),
    });
  }
  return polylinesInfo;
}

/**
 * Converts all polylines for two segments from world space to canvas space for a given viewport.
 * @param viewport The viewport to use for conversion
 * @param segment1 The first segment info
 * @param segment2 The second segment info
 * @returns Object with polyLinesInfoCanvas1 and polyLinesInfoCanvas2 arrays
 */
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

  const polyLinesInfoWorld1 = getPolylinesInfoWorld(
    segmentation1.representationData.Contour,
    segment1.segmentIndex
  );
  const polyLinesInfoWorld2 = getPolylinesInfoWorld(
    segmentation2.representationData.Contour,
    segment2.segmentIndex
  );

  if (!polyLinesInfoWorld1 || !polyLinesInfoWorld2) {
    return;
  }

  const polyLinesInfoCanvas1 = polyLinesInfoWorld1.map(
    ({ polyline, viewReference }) => {
      return {
        polyline: convertContourPolylineToCanvasSpace(polyline, viewport),
        viewReference,
      };
    }
  );
  const polyLinesInfoCanvas2 = polyLinesInfoWorld2.map(
    ({ polyline, viewReference }) => {
      return {
        polyline: convertContourPolylineToCanvasSpace(polyline, viewport),
        viewReference,
      };
    }
  );
  return { polyLinesInfoCanvas1, polyLinesInfoCanvas2 };
}

/**
 * Adds a new segment entry to the segmentation object.
 * @param segmentation The segmentation object
 * @param param1 Object with segmentIndex, label, and color
 */
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

/**
 * Removes all annotations for a given segment index from the segmentation.
 * This function iterates through the provided annotationUIDList,
 * retrieves each annotation, removes it from the state management,
 * and also removes the corresponding contour segmentation annotation.
 * After processing, it clears the annotationUIDList to avoid memory leaks or unintended reuse.
 * @param annotationUIDList
 */
function removeAnnotations(annotationUIDList: Set<string>) {
  annotationUIDList.forEach((annotationUID) => {
    const annotation = getAnnotation(annotationUID);
    removeAnnotation(annotationUID);
    removeContourSegmentationAnnotation(
      annotation as ContourSegmentationAnnotation
    );
  });
  annotationUIDList.clear(); // Clear the set after removal
}

/**
 * Applies a logical operation (union, subtract, intersect, xor) between two segments,
 * converts the result back to world space, and updates the segmentation.
 * @param segment1 The first segment info
 * @param segment2 The second segment info
 * @param options Operator options (target segment info)
 * @param operation The logical operation to perform
 */
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

  const { polyLinesInfoCanvas1, polyLinesInfoCanvas2 } =
    extractPolylinesInCanvasSpace(viewport, segment1, segment2) || {};
  if (!polyLinesInfoCanvas1 || !polyLinesInfoCanvas2) {
    return;
  }
  let polylinesMerged;
  switch (operation) {
    case LogicalOperation.Union:
      polylinesMerged = unifyPolylineSets(
        polyLinesInfoCanvas1,
        polyLinesInfoCanvas2
      );
      break;
    case LogicalOperation.Subtract:
      polylinesMerged = subtractPolylineSets(
        polyLinesInfoCanvas1,
        polyLinesInfoCanvas2
      );
      break;
    case LogicalOperation.Intersect:
      polylinesMerged = intersectPolylinesSets(
        polyLinesInfoCanvas1,
        polyLinesInfoCanvas2
      );
      break;
    case LogicalOperation.XOR:
      polylinesMerged = xorPolylinesSets(
        polyLinesInfoCanvas1,
        polyLinesInfoCanvas2
      );
      break;
    default:
      polylinesMerged = unifyPolylineSets(
        polyLinesInfoCanvas1,
        polyLinesInfoCanvas2
      );
      break;
  }
  // Convert merged polylines back to world space using their associated viewReference
  const polyLinesWorld = polylinesMerged.map(({ polyline, viewReference }) => {
    return {
      polyline: convertContourPolylineToWorld(polyline, viewport),
      viewReference,
    };
  });

  const resultSegment = options;
  const segmentation = getSegmentation(resultSegment.segmentationId);
  const segmentIndex = resultSegment.segmentIndex;
  const color = resultSegment.color;
  const label = resultSegment.label;

  const contourRepresentationData = segmentation.representationData
    .Contour as ContourSegmentationData;
  const { annotationUIDsMap } = contourRepresentationData;
  if (!annotationUIDsMap) {
    return;
  }
  if (
    segment1.segmentationId === resultSegment.segmentationId &&
    segment1.segmentIndex === segmentIndex
  ) {
    // If the segment being modified is the same as the result segment,
    // we need to remove the existing annotations for that segment
    // index before adding new ones.
    const existingAnnotationUIDs = annotationUIDsMap.get(segmentIndex);
    if (existingAnnotationUIDs) {
      removeAnnotations(existingAnnotationUIDs);
    }
  }
  // Add polylines to segmentation, passing viewReference for each
  addPolylinesToSegmentation(
    viewport,
    annotationUIDsMap,
    segmentation.segmentationId,
    polyLinesWorld,
    segmentIndex
  );
  addSegmentInSegmentation(segmentation, { segmentIndex, color, label });
}

/**
 * Performs a union (add) operation between two segments.
 * @param segment1 The first segment info
 * @param segment2 The second segment info
 * @param options Operator options (target segment info)
 */
export function add(
  segment1: SegmentInfo,
  segment2: SegmentInfo,
  options: OperatorOptions
) {
  applyLogicalOperation(segment1, segment2, options, LogicalOperation.Union);
}

/**
 * Performs a subtraction operation between two segments.
 * @param segment1 The first segment info
 * @param segment2 The second segment info
 * @param options Operator options (target segment info)
 */
export function subtract(
  segment1: SegmentInfo,
  segment2: SegmentInfo,
  options: OperatorOptions
) {
  applyLogicalOperation(segment1, segment2, options, LogicalOperation.Subtract);
}

/**
 * Performs an intersection operation between two segments.
 * @param segment1 The first segment info
 * @param segment2 The second segment info
 * @param options Operator options (target segment info)
 */
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

/**
 * Performs an XOR operation between two segments.
 * @param segment1 The first segment info
 * @param segment2 The second segment info
 * @param options Operator options (target segment info)
 */
export function xor(
  segment1: SegmentInfo,
  segment2: SegmentInfo,
  options: OperatorOptions
) {
  applyLogicalOperation(segment1, segment2, options, LogicalOperation.XOR);
}

/**
 * Copies a segment to a new segment index or segmentation.
 * @param segment The source segment info
 * @param options The target segment info
 */
export function copy(segment: SegmentInfo, options: OperatorOptions) {
  copyContourSegment(
    segment.segmentationId,
    segment.segmentIndex,
    options.segmentationId,
    options.segmentIndex
  );
}

/**
 * Deletes all annotations for a given segment from the segmentation.
 * @param segment The segment info
 */
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
  removeAnnotations(annotationUIDList);
}
