import type { Types } from '@cornerstonejs/core';

import type { ContourSegmentationData } from '../../../types';
import {
  getAnnotationMapFromSegmentation,
  type AnnotationInfo,
} from './getAnnotationMapFromSegmentation';

/**
 * Creates a copy of the polyline and adds the first point to the end if closed is true.
 * This is a performant function that only creates a new array when necessary.
 *
 * @param polyline - The input polyline points
 * @param closed - Whether to close the polyline by adding the first point to the end
 * @returns A copy of the polyline, optionally closed
 */
function closePolyline(
  polyline: Types.Point3[],
  closed: boolean
): Types.Point3[] {
  if (!polyline || polyline.length === 0) {
    return [];
  }

  if (!closed) {
    // Return a shallow copy of the original polyline
    return [...polyline];
  }

  // Check if polyline is already closed (first and last points are the same)
  const firstPoint = polyline[0];
  const lastPoint = polyline[polyline.length - 1];

  const isAlreadyClosed =
    firstPoint[0] === lastPoint[0] &&
    firstPoint[1] === lastPoint[1] &&
    firstPoint[2] === lastPoint[2];

  if (isAlreadyClosed) {
    // Return a shallow copy since it's already closed
    return [...polyline];
  }

  // Create a new array with the first point added to the end
  return [...polyline, firstPoint];
}

/**
 * Extracts polylines from contour representation data for a specific segment.
 * Creates a map of annotation UIDs to their corresponding polylines.
 *
 * @param contourRepresentationData - The contour representation data containing annotations
 * @param segmentIndex - The index of the segment to extract polylines from
 * @returns A map of annotation UIDs to their polylines, or undefined if no annotations found
 */
export function getPolylinesMap(
  contourRepresentationData: ContourSegmentationData,
  segmentIndex: number
): Map<string, Types.Point3[]> {
  const { annotationUIDsInSegmentMap } = getAnnotationMapFromSegmentation(
    contourRepresentationData
  );

  if (!annotationUIDsInSegmentMap.has(segmentIndex)) {
    console.warn(
      `No contour information found for segmentIndex ${segmentIndex}`
    );
    return;
  }

  const polylines = new Map<string, Types.Point3[]>();
  const annotationsInfo = annotationUIDsInSegmentMap.get(
    segmentIndex
  ) as AnnotationInfo[];
  for (const annotationInfo of annotationsInfo) {
    polylines.set(
      annotationInfo.annotationUID,
      closePolyline(annotationInfo.polyline, annotationInfo.isClosed)
    );
    for (let i = 0; i < annotationInfo.holesUIDs?.length; i++) {
      polylines.set(
        annotationInfo.holesUIDs[i],
        closePolyline(
          annotationInfo.holesPolyline[i],
          annotationInfo.holesClosed[i]
        )
      );
    }
  }
  return polylines;
}
