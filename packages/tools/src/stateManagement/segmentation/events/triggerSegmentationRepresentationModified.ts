import { triggerEvent, eventTarget } from '@cornerstonejs/core';

import type { SegmentationRepresentations } from '../../../enums';
import { Events } from '../../../enums';
import type { SegmentationRepresentationModifiedEventDetail } from '../../../types/EventTypes';

/**
 * Trigger an event that a segmentation representation is modified
 * @param viewportId - The Id of viewport
 * @param segmentationId - The Id of segmentation
 * @param type - The type of segmentation representation
 */
export function triggerSegmentationRepresentationModified(
  viewportId: string,
  segmentationId: string,
  type?: SegmentationRepresentations
): void {
  const eventDetail: SegmentationRepresentationModifiedEventDetail = {
    segmentationId,
    type,
    viewportId,
  };

  triggerEvent(
    eventTarget,
    Events.SEGMENTATION_REPRESENTATION_MODIFIED,
    eventDetail
  );
}
