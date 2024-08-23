import type { RepresentationConfig } from '../../types';
import { defaultSegmentationStateManager } from './SegmentationStateManager';
import { triggerSegmentationRepresentationModified } from './triggerSegmentationEvents';

/**
 * Sets the per-segment configuration for a given segmentation representation.
 *
 * @param segmentationRepresentationUID - The unique identifier of the segmentation representation.
 * @param config - The per-segment configuration to set.
 * @param suppressEvents - Optional. If true, events will not be triggered. Defaults to false.
 */
export function setPerSegmentConfig(
  segmentationRepresentationUID: string,
  config: RepresentationConfig,
  suppressEvents?: boolean
): void {
  const segmentationStateManager = defaultSegmentationStateManager;
  segmentationStateManager.setPerSegmentConfig(
    segmentationRepresentationUID,
    config
  );

  if (!suppressEvents) {
    triggerSegmentationRepresentationModified(segmentationRepresentationUID);
  }
}
