import { defaultSegmentationStateManager } from './SegmentationStateManager';

/**
 * Adds a segmentation representation UID to a specific viewport.
 *
 * This function uses the default segmentation state manager to associate
 * a segmentation representation with a given viewport. This is typically
 * used to prepare a viewport for rendering a specific segmentation.
 *
 * @param viewportId - The unique identifier of the viewport to which the
 *                     segmentation representation should be added.
 * @param segmentationRepresentationUID - The unique identifier of the
 *                                        segmentation representation to be
 *                                        added to the viewport.
 *
 * @returns void
 *
 * @example
 * ```typescript
 * addSegmentationRepresentationUIDToViewport('viewport1', 'segmentationUID123');
 * ```
 */
export function addSegmentationRepresentationUIDToViewport(
  viewportId: string,
  segmentationRepresentationUID: string
): void {
  const segmentationStateManager = defaultSegmentationStateManager;

  const segmentationRepresentation =
    segmentationStateManager.getSegmentationRepresentation(
      segmentationRepresentationUID
    );

  if (!segmentationRepresentation) {
    throw new Error(
      `Segmentation representation with UID ${segmentationRepresentationUID} not found`
    );
  }

  segmentationStateManager.addSegmentationRepresentationToViewport(
    viewportId,
    segmentationRepresentationUID
  );
}
