import type { GlobalConfig } from '../../types';
import { defaultSegmentationStateManager } from './SegmentationStateManager';
import { triggerSegmentationModified } from './triggerSegmentationEvents';

/**
 * Set the global segmentation configuration. It fires SEGMENTATION_MODIFIED
 * event if not suppressed.
 *
 * @triggers SEGMENTATION_MODIFIED
 * @param config - The new global segmentation config.
 * @param suppressEvents - If true, the `segmentationGlobalStateModified` event will not be triggered.
 */
export function setGlobalConfig(
  config: GlobalConfig,
  suppressEvents?: boolean
): void {
  const segmentationStateManager = defaultSegmentationStateManager;
  segmentationStateManager.setGlobalConfig(config);

  if (!suppressEvents) {
    triggerSegmentationModified();
  }
}
