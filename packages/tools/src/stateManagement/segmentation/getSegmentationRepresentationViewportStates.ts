import { defaultSegmentationStateManager } from './SegmentationStateManager';

/**
 * Retrieves the rendering state of representations for a specific viewport.
 * @param viewportId - The ID of the viewport.
 * @returns An object containing the rendering state of representations for the specified viewport.
 */
export function getSegmentationRepresentationViewportStates(
  viewportId: string
): {
  [segRepUID: string]: {
    visible: boolean;
    segmentsHidden: Set<number>;
    active: boolean;
  };
} {
  const segmentationStateManager = defaultSegmentationStateManager;
  const state = segmentationStateManager.getState();
  return state.viewports?.[viewportId] || {};
}
