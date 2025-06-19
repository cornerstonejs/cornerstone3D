import type { ContourSegmentationAnnotation } from '../../../types';
import { findContourHoles } from '../../../utilities/contours';
import {
  getAnnotation,
  clearParentAnnotation,
} from '../../annotation/annotationState';
import { getSegmentation } from '../getSegmentation';
import { extractSegmentPolylines } from './extractSegmentPolylines';

/**
 * Discovers contour holes in a segment, clears their parent, and adds their annotationUID to the representationData.annotationUIDsSet.
 * @param segmentationId - The unique identifier of the segmentation
 * @param segmentIndex - The index of the segment within the segmentation
 */
export default function convertContourHoles(
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

  const { annotationUIDsMap } = segmentation?.representationData.Contour || {};
  if (!annotationUIDsMap) {
    console.warn(`No annotation map found for segmentation ${segmentationId}`);
    return;
  }
  const annotationsUIDsSet = annotationUIDsMap?.get(segmentIndex);
  if (!annotationsUIDsSet) {
    console.warn(
      `Segmentation index ${segmentIndex} has no annotations in segmentation ${segmentationId}`
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
        clearParentAnnotation(annotation);
        // Add the annotationUID of the hole to the annotationUIDsSet
        annotationsUIDsSet.add(annotation.annotationUID);
      });
    });
  }
}
