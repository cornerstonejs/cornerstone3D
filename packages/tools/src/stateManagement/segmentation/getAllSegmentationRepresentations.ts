import type { SegmentationRepresentation } from '../../types/SegmentationStateTypes';
import { defaultSegmentationStateManager } from './SegmentationStateManager';

/**
 * Get all segmentation representations in the state
 * @returns An array of segmentation representation objects.
 */
export function getAllSegmentationRepresentations(): SegmentationRepresentation[] {
  const segmentationStateManager = defaultSegmentationStateManager;
  const state = segmentationStateManager.getState();
  return Object.values(state.representations);
}
