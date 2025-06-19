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
 * Optionally, moves the holes to another segmentation/segment if targetSegmentationId and targetSegmentationIndex are provided.
 * @param segmentationId - The unique identifier of the segmentation
 * @param segmentIndex - The index of the segment within the segmentation
 * @param targetSegmentationId - (optional) The target segmentation to move holes to
 * @param targetSegmentationIndex - (optional) The target segment index in the target segmentation
 */
export default function convertContourHoles(
  segmentationId: string,
  segmentIndex: number,
  targetSegmentationId?: string,
  targetSegmentationIndex?: number
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

  // Check if targetSegmentationId and targetSegmentationIndex are provided
  // If so get the targetUIDsSet variable
  let targetUIDsSet: Set<string> | undefined;
  if (targetSegmentationId && typeof targetSegmentationIndex === 'number') {
    const targetSegmentation = getSegmentation(targetSegmentationId);
    if (!targetSegmentation) {
      console.warn(
        `Target segmentation ${targetSegmentationId} does not exist.`
      );
      return;
    }
    if (!targetSegmentation.representationData.Contour) {
      console.warn(
        `No contour representation found for target segmentation ${targetSegmentationId}`
      );
      return;
    }
    targetUIDsSet =
      targetSegmentation.representationData.Contour.annotationUIDsMap.get(
        targetSegmentationIndex
      );
    if (!targetUIDsSet) {
      // Create the set if it doesn't exist yet
      targetUIDsSet = new Set();
      targetSegmentation.representationData.Contour.annotationUIDsMap.set(
        targetSegmentationIndex,
        targetUIDsSet
      );
    }
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
        if (
          targetSegmentationId &&
          typeof targetSegmentationIndex === 'number'
        ) {
          // Move to another segmentation/segment
          targetUIDsSet.add(annotation.annotationUID);
        } else {
          // Add the annotationUID of the hole to the annotationUIDsSet in the current segmentation and segmentIndex
          annotationsUIDsSet.add(annotation.annotationUID);
        }
      });
    });
  }
}
