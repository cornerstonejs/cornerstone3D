import type { SegmentationRepresentations } from '../../enums';
import type { SegmentationEntry } from '../../types/SegmentationStateTypes';
import { defaultSegmentationStateManager } from './SegmentationStateManager';

/**
 * Retrieves the viewport IDs that have a specific segmentation.
 * @param segmentationId - The ID of the segmentation.
 * @returns An array of viewport IDs that have the specified segmentation.
 */
export function getViewportSegmentationEntries(
  viewportId: string,
  type?: SegmentationRepresentations
): SegmentationEntry[] {
  const segmentationStateManager = defaultSegmentationStateManager;
  const state = segmentationStateManager.getState();
  const viewports = state.viewports;

  const segmentationEntries = viewports[viewportId];

  if (type) {
    return segmentationEntries.filter(
      (segmentationEntry) => segmentationEntry.type === type
    );
  } else {
    return segmentationEntries;
  }
}
