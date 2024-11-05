import { triggerEvent, eventTarget } from '@cornerstonejs/core';

import { Events } from '../../../enums';
import type { SegmentationAddedEventDetail } from '../../../types/EventTypes';

/**
 * Triggers an event when a new segmentation is added to the state manager.
 * Notifies all listeners that a new segmentation has been added to the global state.
 *
 * @param segmentationId - The unique identifier of the segmentation that was added
 */
export function triggerSegmentationAdded(segmentationId: string): void {
  const eventDetail: SegmentationAddedEventDetail = {
    segmentationId,
  };
  triggerEvent(eventTarget, Events.SEGMENTATION_ADDED, eventDetail);
}
