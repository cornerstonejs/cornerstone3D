import { triggerEvent, eventTarget } from '@cornerstonejs/core';

import { Events } from '../../../enums';
import type { SegmentationRepresentationRemovedEventDetail } from '../../../types/EventTypes';

/**
 * Trigger an event that a segmentation representation was removed
 * @param segmentationRepresentationUID - The UID of the segmentation
 * representation that was removed.
 */
export function triggerSegmentationRepresentationRemoved(
  segmentationRepresentationUID: string
): void {
  const eventDetail: SegmentationRepresentationRemovedEventDetail = {
    segmentationRepresentationUID,
  };

  triggerEvent(
    eventTarget,
    Events.SEGMENTATION_REPRESENTATION_REMOVED,
    eventDetail
  );
}
