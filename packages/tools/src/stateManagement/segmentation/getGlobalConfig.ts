import type { SegmentationRepresentationConfig } from '../../types';
import { defaultSegmentationStateManager } from './SegmentationStateManager';

/**
 * It returns the global segmentation config.
 * @returns The global segmentation configuration for all segmentations.
 */
export function getGlobalConfig(): SegmentationRepresentationConfig {
  const segmentationStateManager = defaultSegmentationStateManager;
  return segmentationStateManager.getGlobalConfig();
}
