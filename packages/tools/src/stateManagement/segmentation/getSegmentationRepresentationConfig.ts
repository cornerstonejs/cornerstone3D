import type { RepresentationConfig } from '../../types';
import { defaultSegmentationStateManager } from './SegmentationStateManager';

/**
 * Retrieves the configuration for all segments associated with the given segmentation representation UID.
 *
 * @param segmentationRepresentationUID - The UID of the segmentation representation.
 * @returns The configuration for all segments.
 */
export function getSegmentationRepresentationConfig(
  segmentationRepresentationUID: string
): RepresentationConfig {
  const segmentationStateManager = defaultSegmentationStateManager;

  return segmentationStateManager.getSegmentationRepresentationConfig(
    segmentationRepresentationUID
  );
}
