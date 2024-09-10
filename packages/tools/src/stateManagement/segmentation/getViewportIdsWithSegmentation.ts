import { defaultSegmentationStateManager } from './SegmentationStateManager';

/**
 * Retrieves the viewport IDs that have a specific segmentation.
 * @param segmentationId - The ID of the segmentation.
 * @returns An array of viewport IDs that have the specified segmentation.
 */
export function getViewportIdsWithSegmentation(
  segmentationId: string
): string[] {
  const segmentationStateManager = defaultSegmentationStateManager;
  const state = segmentationStateManager.getState();
  const viewports = state.viewports;

  const viewportIdsWithSegmentation = Object.entries(viewports)
    .filter(([, viewportSegmentations]) =>
      viewportSegmentations.some(
        (segRep) => segRep.segmentationId === segmentationId
      )
    )
    .map(([viewportId]) => viewportId);

  return viewportIdsWithSegmentation;
}
