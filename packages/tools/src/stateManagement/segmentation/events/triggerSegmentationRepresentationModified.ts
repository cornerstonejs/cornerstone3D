import { triggerEvent, eventTarget } from '@cornerstonejs/core';

import { Events, SegmentationRepresentations } from '../../../enums';
import type { SegmentationRemovedEventDetail } from '../../../types/EventTypes';

/**
 * Trigger an event that a segmentation is removed
 * @param segmentationId - The Id of segmentation
 */
export function triggerSegmentationRepresentationModified(
  viewportId: string,
  segmentationId: string
  type: SegmentationRepresentations
): void {
  const eventDetail: SegmentationRemovedEventDetail = {
    segmentationId,
    type,
    viewportId,
  };

  triggerEvent(eventTarget, Events.SEGMENTATION_REMOVED, eventDetail);
}
