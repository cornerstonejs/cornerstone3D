import { defaultSegmentationStateManager } from './SegmentationStateManager';
import { getSegmentation } from './getSegmentation';
import { getActiveSegmentIndex } from './getActiveSegmentIndex';
import { getLabelmapForSegment } from './helpers/labelmapSegmentationState';

/**
 * Retrieves the labelmap image IDs for a specific viewport and segmentation representation.
 *
 * @param viewportId - The ID of the viewport.
 * @param segmentationId -  The ID of the segmentation.
 * @returns An array of labelmap image IDs.
 *
 * @deprecated Use getCurrentLabelmapImageIdsForViewport instead. since we
 * have added support for multiple imageIds in the same viewport for the
 * same labelmap representation (overlapping segments usecase)
 */
export function getCurrentLabelmapImageIdForViewport(
  viewportId: string,
  segmentationId: string
): string | undefined {
  const imageIds = getCurrentLabelmapImageIdsForViewport(
    viewportId,
    segmentationId
  );

  if (!imageIds?.length) {
    return;
  }

  if (imageIds.length === 1) {
    return imageIds[0];
  }

  const segmentation = getSegmentation(segmentationId);
  const activeSegmentIndex = getActiveSegmentIndex(segmentationId);
  const activeLayer = activeSegmentIndex
    ? getLabelmapForSegment(segmentation, activeSegmentIndex)
    : undefined;

  if (!activeLayer?.imageIds?.length) {
    return imageIds[0];
  }

  return (
    imageIds.find((imageId) => activeLayer.imageIds.includes(imageId)) ??
    imageIds[0]
  );
}

/**
 * Retrieves the labelmap image IDs for a specific viewport and segmentation representation.
 * If the segmentation has multiple imageIds for in the current view of the same segmentation
 * this function will return an array of imageIds.
 *
 * @param viewportId - The ID of the viewport.
 * @param segmentationId -  The ID of the segmentation.
 * @returns An array of labelmap image IDs.
 */
export function getCurrentLabelmapImageIdsForViewport(
  viewportId: string,
  segmentationId: string
) {
  const segmentationStateManager = defaultSegmentationStateManager;
  return segmentationStateManager.getCurrentLabelmapImageIdsForViewport(
    viewportId,
    segmentationId
  );
}

export function getLabelmapImageIdsForImageId(
  imageId: string,
  segmentationId: string
) {
  const segmentationStateManager = defaultSegmentationStateManager;
  return segmentationStateManager.getLabelmapImageIdsForImageId(
    imageId,
    segmentationId
  );
}
