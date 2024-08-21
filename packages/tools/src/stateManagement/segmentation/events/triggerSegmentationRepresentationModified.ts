import { triggerEvent, eventTarget } from '@cornerstonejs/core';

import { Events } from '../../../enums';
import type { SegmentationRepresentationModifiedEventDetail } from '../../../types/EventTypes';

/**
 * Trigger an event on the eventTarget that the segmentation representation has been updated
 * @param segmentationRepresentationUID - The UID of the segmentation representation
 */
export function triggerSegmentationRepresentationModified(
  segmentationRepresentationUID: string
): void {
  const eventDetail: SegmentationRepresentationModifiedEventDetail = {
    segmentationRepresentationUID,
  };

  triggerEvent(
    eventTarget,
    Events.SEGMENTATION_REPRESENTATION_MODIFIED,
    eventDetail
  );
}
