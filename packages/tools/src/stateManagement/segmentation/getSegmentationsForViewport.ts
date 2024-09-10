import type { SegmentationRepresentations } from '../../enums';
import type { SegmentationEntry } from '../../types/SegmentationStateTypes';
import { defaultSegmentationStateManager } from './SegmentationStateManager';

/**
 * Retrieves the segmentation entries for a specific viewport based on the given specifier.
 * @param viewportId - The ID of the viewport.
 * @param specifier - An object specifying the type and/or segmentationId to filter by.
 * @returns An array of SegmentationEntry objects that match the specifier.
 */
export function getViewportSegmentationEntries(
  viewportId: string,
  specifier: {
    type?: SegmentationRepresentations;
    segmentationId?: string;
  } = {}
): SegmentationEntry[] {
  const segmentationStateManager = defaultSegmentationStateManager;
  const state = segmentationStateManager.getState();
  const viewports = state.viewports;

  const segmentationEntries = viewports[viewportId] || [];

  // If no specifier is provided, return all entries
  if (!specifier.type && !specifier.segmentationId) {
    return segmentationEntries;
  }

  return segmentationEntries.filter((segmentationEntry) => {
    const typeMatch = specifier.type
      ? segmentationEntry.type === specifier.type
      : true;
    const idMatch = specifier.segmentationId
      ? segmentationEntry.segmentationId === specifier.segmentationId
      : true;
    return typeMatch && idMatch;
  });
}
