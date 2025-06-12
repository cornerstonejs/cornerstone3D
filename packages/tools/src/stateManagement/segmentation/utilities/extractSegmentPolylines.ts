import type { Types } from '@cornerstonejs/core';
import type { ContourSegmentationData } from '../../../types';
import { getSegmentation } from '../getSegmentation';
import { convertContourPolylineToCanvasSpace } from '../../../utilities/contourSegmentation';
import { getViewportAssociatedToSegmentation } from './getViewportAssociatedToSegmentation';
import { getPolylinesMap } from './getPolylineMap';

/**
 * Extracts segment polylines from a segmentation and converts them to canvas space coordinates.
 * This function retrieves all contour annotations for a specific segment and transforms their
 * world coordinates to canvas coordinates for rendering or processing.
 *
 * @param segmentationId - The unique identifier of the segmentation
 * @param segmentIndex - The index of the segment within the segmentation
 * @param viewport - Optional viewport to use for coordinate conversion. If not provided, will find the associated viewport
 * @returns A map of annotation UIDs to their canvas space polylines, or undefined if extraction fails
 */
export function extractSegmentPolylines(
  segmentationId: string,
  segmentIndex: number,
  viewport?: Types.IViewport
) {
  if (!viewport) {
    viewport = getViewportAssociatedToSegmentation(segmentationId);
  }
  if (!viewport) {
    return;
  }

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
    polylinesCanvasMap.set(
      key,
      convertContourPolylineToCanvasSpace(polyLinesMap.get(key), viewport)
    );
  }
  return polylinesCanvasMap;
}
