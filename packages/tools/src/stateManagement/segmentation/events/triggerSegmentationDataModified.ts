import { triggerEvent, eventTarget } from '@cornerstonejs/core';

import { Events } from '../../../enums';
import type { SegmentationDataModifiedEventDetail } from '../../../types/EventTypes';
import { setSegmentationDirty } from '../../../utilities/segmentation/utilities';

/**
 * Trigger an event that a segmentation data has been modified
 * @param segmentationId - The Id of segmentation
 * @param options.voxelsUnchanged - the event announces a new view of the
 * segmentation and no voxel changed, so labelmap volumes skip re-reducing
 */
export function triggerSegmentationDataModified(
  segmentationId: string,
  modifiedSlicesToUse?: number[],
  segmentIndex?: number,
  { voxelsUnchanged }: { voxelsUnchanged?: boolean } = {}
): void {
  const eventDetail: SegmentationDataModifiedEventDetail = {
    segmentationId,
    modifiedSlicesToUse,
    segmentIndex,
    ...(voxelsUnchanged ? { voxelsUnchanged } : {}),
  };

  // set it to dirty to force the next call to getUniqueSegmentIndices to
  // recalculate the segment indices
  setSegmentationDirty(segmentationId);

  triggerEvent(eventTarget, Events.SEGMENTATION_DATA_MODIFIED, eventDetail);
}
