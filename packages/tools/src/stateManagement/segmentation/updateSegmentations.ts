import type { Segmentation } from '../../types/SegmentationStateTypes';
import { defaultSegmentationStateManager } from './SegmentationStateManager';
import { triggerSegmentationModified } from './triggerSegmentationEvents';

/**
 * Updates multiple segmentations with new data.
 *
 * @param segmentationUpdateArray - An array of objects containing segmentation updates.
 * Each object should have a `segmentationId` and a `payload` with the properties to update.
 * @param suppressEvents - If true, the segmentation modified event will not be triggered.
 *
 * @example
 * ```typescript
 * updateSegmentations([
 *   { segmentationId: 'seg1', payload: { label: 'New Label' } },
 *   { segmentationId: 'seg2', payload: { segments: {} } }
 * ]);
 * ```
 */
export function updateSegmentations(
  segmentationUpdateArray: {
    segmentationId: string;
    payload: Partial<Segmentation>;
  }[],
  suppressEvents?: boolean
): void {
  const segmentationStateManager = defaultSegmentationStateManager;

  segmentationUpdateArray.forEach((segmentationUpdate) => {
    segmentationStateManager.updateSegmentation(
      segmentationUpdate.segmentationId,
      segmentationUpdate.payload
    );

    if (!suppressEvents) {
      triggerSegmentationModified(segmentationUpdate.segmentationId);
    }
  });
}
