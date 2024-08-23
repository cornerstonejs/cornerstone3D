import type { RepresentationConfig } from '../../types/SegmentationStateTypes';
import { defaultSegmentationStateManager } from './SegmentationStateManager';

/**
 * Retrieves the per-segment configuration for a given segmentation representation.
 *
 * @param segmentationRepresentationUID - The unique identifier of the segmentation representation.
 * @returns The per-segment configuration for the specified segmentation representation.
 */
export function getPerSegmentConfig(
  segmentationRepresentationUID: string
): RepresentationConfig {
  const segmentationStateManager = defaultSegmentationStateManager;
  return segmentationStateManager.getPerSegmentConfig(
    segmentationRepresentationUID
  );
}
