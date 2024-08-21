import { triggerEvent, eventTarget } from '@cornerstonejs/core';

import { Events } from '../../enums';
import type {
  SegmentationRepresentationModifiedEventDetail,
  SegmentationDataModifiedEventDetail,
  SegmentationModifiedEventDetail,
  SegmentationRepresentationRemovedEventDetail,
  SegmentationRemovedEventDetail,
} from '../../types/EventTypes';
import { setSegmentationDirty } from '../../utilities/segmentation/utilities';
import { defaultSegmentationStateManager } from './SegmentationStateManager';

/**
 * Trigger an event that a segmentation is removed
 * @param segmentationId - The Id of segmentation
 */
function triggerSegmentationRemoved(segmentationId: string): void {
  const eventDetail: SegmentationRemovedEventDetail = {
    segmentationId,
  };

  triggerEvent(eventTarget, Events.SEGMENTATION_REMOVED, eventDetail);
}

/**
 * Trigger an event that a segmentation representation was removed
 * @param segmentationRepresentationUID - The UID of the segmentation
 * representation that was removed.
 */
function triggerSegmentationRepresentationRemoved(
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

/**
 * Trigger an event on the eventTarget that the segmentation representation has been updated
 * @param segmentationRepresentationUID - The UID of the segmentation representation
 */
function triggerSegmentationRepresentationModified(
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

/**
 * Triggers segmentation global state updated event, notifying all listeners
 * that the global state has been updated. If a segmentationId is provided,
 * the event will only be triggered for that segmentation; otherwise, it will
 * be triggered for all segmentations.
 *
 * @param segmentationId - The id of the segmentation that has been updated
 */
function triggerSegmentationModified(segmentationId?: string): void {
  let segmentationIds;

  if (segmentationId) {
    segmentationIds = [segmentationId];
  } else {
    const segmentationStateManager = defaultSegmentationStateManager;
    const state = segmentationStateManager.getState();

    segmentationIds = state.segmentations.map(
      ({ segmentationId }) => segmentationId
    );
  }

  segmentationIds.forEach((segmentationId) => {
    const eventDetail: SegmentationModifiedEventDetail = {
      segmentationId,
    };
    triggerEvent(eventTarget, Events.SEGMENTATION_MODIFIED, eventDetail);
  });
}

/**
 * Trigger an event that a segmentation data has been modified
 * @param segmentationId - The Id of segmentation
 */
function triggerSegmentationDataModified(
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

export {
  triggerSegmentationRepresentationModified,
  triggerSegmentationRepresentationRemoved,
  triggerSegmentationDataModified,
  triggerSegmentationModified,
  triggerSegmentationRemoved,
};
