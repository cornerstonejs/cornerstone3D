import type {
  ContourSegmentationAnnotation,
  ContourSegmentationData,
} from '../../../types';
import { getSegmentation } from '../getSegmentation';
import { convertContourPolylineToCanvasSpace } from '../../../utilities/contourSegmentation';
import {
  getViewportsAssociatedToSegmentation,
  getViewportWithMatchingViewPlaneNormal,
} from './getViewportAssociatedToSegmentation';
import { getPolylinesMap } from './getPolylineMap';
import { getAnnotation } from '../../annotation/annotationState';

/**
 * Extracts segment polylines from a segmentation and converts them to canvas space coordinates.
 * This function retrieves all contour annotations for a specific segment and transforms their
 * world coordinates to canvas coordinates for rendering or processing.
 *
 * @param segmentationId - The unique identifier of the segmentation
 * @param segmentIndex - The index of the segment within the segmentation
 * @returns A map of annotation UIDs to their canvas space polylines, or undefined if extraction fails
 */
export function extractSegmentPolylines(
  segmentationId: string,
  segmentIndex: number
) {
  const viewports = getViewportsAssociatedToSegmentation(segmentationId);

  const segmentation = getSegmentation(segmentationId);
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

  if (!annotationUIDsMap.get(segmentIndex)) {
    return;
  }

  const polyLinesMap = getPolylinesMap(contourRepresentationData, segmentIndex);
  if (!polyLinesMap) {
    return;
  }
  const keys = Array.from(polyLinesMap?.keys());
  const polylinesCanvasMap = new Map();

  for (const key of keys) {
    const annotation = getAnnotation(key) as ContourSegmentationAnnotation;
    const viewport = getViewportWithMatchingViewPlaneNormal(
      viewports,
      annotation
    );
    polylinesCanvasMap.set(
      key,
      convertContourPolylineToCanvasSpace(polyLinesMap.get(key), viewport)
    );
  }
  return polylinesCanvasMap;
}
