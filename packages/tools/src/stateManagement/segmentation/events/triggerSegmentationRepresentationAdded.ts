import { triggerEvent, eventTarget } from '@cornerstonejs/core';

import type { SegmentationRepresentations } from '../../../enums';
import { Events } from '../../../enums';
import type { SegmentationRepresentationModifiedEventDetail } from '../../../types/EventTypes';

/**
 * Triggers SEGMENTATION_REPRESENTATION_ADDED when a segmentation
 * representation is added to a viewport. The detail is the one of the
 * other representation events, which the listener of `init` reads.
 *
 * @param viewportId - The Id of the viewport
 * @param segmentationId - The Id of the segmentation
 * @param type - The type of the segmentation representation
 */
export function triggerSegmentationRepresentationAdded(
  viewportId: string,
  segmentationId: string,
  type: SegmentationRepresentations
): void {
  const eventDetail: SegmentationRepresentationModifiedEventDetail = {
    segmentationId,
    type,
    viewportId,
  };

  triggerEvent(
    eventTarget,
    Events.SEGMENTATION_REPRESENTATION_ADDED,
    eventDetail
  );
}
