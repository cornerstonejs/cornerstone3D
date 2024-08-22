import type { RepresentationConfig } from '../../types';
import { defaultSegmentationStateManager } from './SegmentationStateManager';
import { triggerSegmentationRepresentationModified } from './triggerSegmentationEvents';

/**
 * Sets the configuration for all segments in a segmentation representation.
 *
 * @param segmentationRepresentationUID - The UID of the segmentation representation.
 * @param config - The configuration to be set for all segments.
 * @param suppressEvents - Optional. If true, events will not be triggered. Defaults to false.
 */
export function setSegmentationRepresentationConfig(
  segmentationRepresentationUID: string,
  config: RepresentationConfig,
  suppressEvents?: boolean
): void {
  const segmentationStateManager = defaultSegmentationStateManager;
  segmentationStateManager.setSegmentationRepresentationConfig(
    segmentationRepresentationUID,
    config
  );

  if (!suppressEvents) {
    triggerSegmentationRepresentationModified(segmentationRepresentationUID);
  }
}
