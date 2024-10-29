import type { Segmentation } from '../../types';
import { defaultSegmentationStateManager } from './SegmentationStateManager';

/**
 * Get the segmentations inside the state
 * @returns Segmentation array
 */
export function getSegmentations(): Segmentation[] | [] {
  const segmentationStateManager = defaultSegmentationStateManager;
  const state = segmentationStateManager.getState();

  return state.segmentations;
}
