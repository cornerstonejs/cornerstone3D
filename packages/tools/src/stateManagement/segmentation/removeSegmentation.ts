import { defaultSegmentationStateManager } from './SegmentationStateManager';
import { triggerSegmentationRemoved } from './triggerSegmentationEvents';
import { removeSegmentationRepresentations } from './removeSegmentationRepresentations';

/**
 * Removes the segmentation from the segmentation state manager and its representations from all viewports
 *
 * @triggers SEGMENTATION_REMOVED
 *
 * @param segmentationId - The id of the segmentation
 */
export function removeSegmentation(segmentationId: string): void {
  const segmentationStateManager = defaultSegmentationStateManager;

  // Get all viewport IDs that have a representation of this segmentation
  const viewportsWithSegmentation = segmentationStateManager
    .getAllViewportSegmentationRepresentations()
    .filter(({ representations }) =>
      representations.some((rep) => rep.segmentationId === segmentationId)
    )
    .map(({ viewportId }) => viewportId);

  // Remove segmentation representations from all affected viewports
  viewportsWithSegmentation.forEach((viewportId) => {
    removeSegmentationRepresentations(viewportId, { segmentationId });
  });

  // Remove the segmentation from the state
  segmentationStateManager.removeSegmentation(segmentationId);

  // Trigger the removal event
  triggerSegmentationRemoved(segmentationId);
}

/**
 * Removes all segmentations from the segmentation state manager and their representations from all viewports
 *
 * @triggers SEGMENTATION_REMOVED for each segmentation
 */
export function removeAllSegmentations(): void {
  const segmentationStateManager = defaultSegmentationStateManager;
  const segmentations = segmentationStateManager.getState().segmentations;

  // Remove each segmentation
  segmentations.forEach((segmentation) => {
    removeSegmentation(segmentation.segmentationId);
  });

  // Clear the state
  segmentationStateManager.resetState();
}
