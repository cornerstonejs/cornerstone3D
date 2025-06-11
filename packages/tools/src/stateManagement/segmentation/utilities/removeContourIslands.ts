import type { ContourSegmentationAnnotation } from '../../../types';
import { getAnnotation } from '../../annotation/annotationState';
import { getSegmentation } from '../getSegmentation';
import { extractSegmentPolylines } from './extractSegmentPolylines';
import findIslands from '../../../utilities/contours/findIslands';
import { removeCompleteContourAnnotation } from './removeCompleteContourAnnotation';

/**
 * Removes contour islands from a segmentation segment by detecting and deleting small isolated contours.
 * Islands are contours that are smaller than the specified threshold and are not connected to larger contours.
 * This helps clean up segmentations by removing noise and small artifacts.
 *
 * @param segmentationId - The unique identifier of the segmentation
 * @param segmentIndex - The index of the segment within the segmentation
 * @param options - Configuration options for island detection
 * @param options.threshold - The minimum size threshold for contours (default: 3)
 */
export default function removeContourIslands(
  segmentationId: string,
  segmentIndex: number,
  options: { threshold: number } = { threshold: 3 }
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

  const islands = findIslands(polylines, options.threshold);
  if (islands?.length > 0) {
    islands.forEach((index) => {
      const annotation = getAnnotation(
        keys[index]
      ) as ContourSegmentationAnnotation;
      removeCompleteContourAnnotation(annotation);
    });
  }
}
