import type { ContourSegmentationAnnotation } from '../../../types';
import { findContourHoles } from '../../../utilities/contours';
import { getAnnotation } from '../../annotation/annotationState';
import { getSegmentation } from '../getSegmentation';
import { extractSegmentPolylines } from './extractSegmentPolylines';
import { removeCompleteContourAnnotation } from './removeCompleteContourAnnotation';

/**
 * Removes contour holes from a segmentation segment by detecting and deleting hole annotations.
 * This function analyzes the polylines in a segment to identify which contours are holes
 * (contours that are inside other contours) and removes them completely.
 *
 * @param segmentationId - The unique identifier of the segmentation
 * @param segmentIndex - The index of the segment within the segmentation
 */
export default function removeContourHoles(
  segmentationId: string,
  segmentIndex: number
) {
  const segmentation = getSegmentation(segmentationId);
  if (!segmentation) {
    console.warn(`Invalid segmentation given ${segmentationId}`);
    return;
  }
  if (!segmentation.representationData.Contour) {
    console.warn(
      `No contour representation found for segmentation ${segmentationId}`
    );
    return;
  }

  const polylinesCanvasMap = extractSegmentPolylines(
    segmentationId,
    segmentIndex
  );
  if (!polylinesCanvasMap) {
    console.warn(
      `Error extracting contour data from segment ${segmentIndex} in segmentation ${segmentationId}`
    );
    return;
  }

  const keys = Array.from(polylinesCanvasMap?.keys());
  const polylines = keys.map((key) => polylinesCanvasMap.get(key));

  const holeDetectionResults = findContourHoles(polylines);
  if (holeDetectionResults?.length > 0) {
    holeDetectionResults.forEach((hole) => {
      hole.holeIndexes.forEach((index) => {
        const annotation = getAnnotation(
          keys[index]
        ) as ContourSegmentationAnnotation;
        removeCompleteContourAnnotation(annotation);
      });
    });
  }
}
