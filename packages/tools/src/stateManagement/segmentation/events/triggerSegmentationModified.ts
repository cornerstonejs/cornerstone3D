import { triggerEvent, eventTarget } from '@cornerstonejs/core';

import { Events } from '../../../enums';
import type { SegmentationModifiedEventDetail } from '../../../types/EventTypes';

/**
 * Triggers segmentation global state updated event, notifying all listeners
 * that the global state has been updated. If a segmentationId is provided,
 * the event will only be triggered for that segmentation; otherwise, it will
 * be triggered for all segmentations.
 *
 * @param segmentationId - The id of the segmentation that has been updated
 */
export function triggerSegmentationModified(segmentationId: string): void {
  const eventDetail: SegmentationModifiedEventDetail = {
    segmentationId,
  };
  triggerEvent(eventTarget, Events.SEGMENTATION_MODIFIED, eventDetail);
}
