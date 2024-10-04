import { triggerEvent, eventTarget } from '@cornerstonejs/core';

import { Events } from '../../../enums';
import type { SegmentationRemovedEventDetail } from '../../../types/EventTypes';

/**
 * Trigger an event that a segmentation is removed
 * @param segmentationId - The Id of segmentation
 */
export function triggerSegmentationRemoved(segmentationId: string): void {
  const eventDetail: SegmentationRemovedEventDetail = {
    segmentationId,
  };

  triggerEvent(eventTarget, Events.SEGMENTATION_REMOVED, eventDetail);
}
