import { triggerEvent, eventTarget } from '@cornerstonejs/core';

import { Events } from '../../../enums';
import type { SegmentationDataModifiedEventDetail } from '../../../types/EventTypes';
import { setSegmentationDirty } from '../../../utilities/segmentation/utilities';

/**
 * Trigger an event that a segmentation data has been modified
 * @param segmentationId - The Id of segmentation
 */
export function triggerSegmentationDataModified(
  segmentationId: string,
  modifiedSlicesToUse?: number[]
): void {
  const eventDetail: SegmentationDataModifiedEventDetail = {
    segmentationId,
    modifiedSlicesToUse,
  };

  // set it to dirty to force the next call to getUniqueSegmentIndices to
  // recalculate the segment indices
  setSegmentationDirty(segmentationId);

  triggerEvent(eventTarget, Events.SEGMENTATION_DATA_MODIFIED, eventDetail);
}
