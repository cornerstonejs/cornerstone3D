import type { SegmentationRepresentations } from '../../enums';
import type { Segmentation } from '../../types';
import { getSegmentation } from './getSegmentation';
import { defaultSegmentationStateManager } from './SegmentationStateManager';

/**
 * Retrieves the viewport IDs that have a specific segmentation.
 * @param segmentationId - The ID of the segmentation.
 * @returns An array of viewport IDs that have the specified segmentation.
 */
export function getViewportSegmentationState(
  viewportId: string,
  type?: SegmentationRepresentations
): Segmentation[] {
  const segmentationStateManager = defaultSegmentationStateManager;
  const state = segmentationStateManager.getState();
  const viewports = state.viewports;

  const segmentationsForViewportId = viewports[viewportId];

  const segmentations = segmentationsForViewportId.map(
    (segmentationInViewport) =>
      getSegmentation(
        type && segmentationInViewport.type === type
          ? segmentationInViewport.segmentationId
          : segmentationInViewport.segmentationId
      )
  );

  const filteredSegmentations = segmentations.filter(
    (segmentation) => segmentation !== undefined
  );

  return filteredSegmentations;
}
