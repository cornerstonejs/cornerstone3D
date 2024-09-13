import { triggerEvent, eventTarget } from '@cornerstonejs/core';

import type { SegmentationRepresentations } from '../../../enums';
import { Events } from '../../../enums';
import type { SegmentationRepresentationRemovedEventDetail } from '../../../types/EventTypes';

/**
 * Trigger an event that a segmentation representation is removed
 * @param viewportId - The Id of viewport
 * @param segmentationId - The Id of segmentation
 * @param type - The type of segmentation representation
 */
export function triggerSegmentationRepresentationRemoved(
  viewportId: string,
  segmentationId: string,
  type: SegmentationRepresentations
): void {
  const eventDetail: SegmentationRepresentationRemovedEventDetail = {
    viewportId,
    segmentationId,
    type,
  };

  triggerEvent(
    eventTarget,
    Events.SEGMENTATION_REPRESENTATION_REMOVED,
    eventDetail
  );
}
