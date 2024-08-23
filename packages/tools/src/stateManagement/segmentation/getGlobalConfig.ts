import type { GlobalConfig } from '../../types';
import { defaultSegmentationStateManager } from './SegmentationStateManager';

/**
 * It returns the global segmentation config.
 * @returns The global segmentation configuration for all segmentations.
 */
export function getGlobalConfig(): GlobalConfig {
  const segmentationStateManager = defaultSegmentationStateManager;
  return segmentationStateManager.getGlobalConfig();
}
