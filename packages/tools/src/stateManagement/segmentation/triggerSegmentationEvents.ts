import { triggerEvent, eventTarget } from '@cornerstonejs/core';

import { Events } from '../../enums';
import {
  getSegmentationRepresentations,
  getSegmentations,
} from '../../stateManagement/segmentation/segmentationState';
import {
  SegmentationRepresentationModifiedEventDetail,
  SegmentationDataModifiedEventDetail,
  SegmentationModifiedEventDetail,
  SegmentationRepresentationRemovedEventDetail,
  SegmentationRemovedEventDetail,
} from '../../types/EventTypes';
import { setSegmentationDirty } from '../../utilities/segmentation/getUniqueSegmentIndices';

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
 * @param toolGroupId - The id of the tool group that the segmentation
 * representation was removed from.
 * @param segmentationRepresentationUID - The UID of the segmentation
 * representation that was removed.
 */
function triggerSegmentationRepresentationRemoved(
  toolGroupId: string,
  segmentationRepresentationUID: string
): void {
  const eventDetail: SegmentationRepresentationRemovedEventDetail = {
    toolGroupId,
    segmentationRepresentationUID,
  };

  triggerEvent(
    eventTarget,
    Events.SEGMENTATION_REPRESENTATION_REMOVED,
    eventDetail
  );
}

/**
 * Trigger an event on the eventTarget that the segmentation representation for
 * toolGroupId has been updated
 * @param toolGroupId - The Id of the toolGroup
 */
function triggerSegmentationRepresentationModified(
  toolGroupId: string,
  segmentationRepresentationUID?: string
): void {
  const eventDetail: SegmentationRepresentationModifiedEventDetail = {
    toolGroupId,
    segmentationRepresentationUID,
  };

  if (segmentationRepresentationUID) {
    triggerEvent(
      eventTarget,
      Events.SEGMENTATION_REPRESENTATION_MODIFIED,
      eventDetail
    );
    return;
  }

  // If no segmentationRepresentationUID is provided, then we need to trigger
  // the event for all segmentation representations in the toolGroup

  // Get all segmentation representations in the toolGroup
  const segmentationRepresentations =
    getSegmentationRepresentations(toolGroupId) || [];

  segmentationRepresentations.forEach((segmentationRepresentation) => {
    const { segmentationRepresentationUID } = segmentationRepresentation;
    const eventDetail: SegmentationRepresentationModifiedEventDetail = {
      toolGroupId,
      segmentationRepresentationUID,
    };

    triggerEvent(
      eventTarget,
      Events.SEGMENTATION_REPRESENTATION_MODIFIED,
      eventDetail
    );
  });
}

/**
 * Triggers segmentation global state updated event, notifying all toolGroups
 * that the global state has been updated, If a segmentationId is provided
 * the event will only be triggered for that segmentation, otherwise it will
 * be triggered for all segmentations.
 *
 * @param segmentationId - The id of the segmentation that has been updated
 */
function triggerSegmentationModified(segmentationId?: string): void {
  let segmentationIds;

  if (segmentationId) {
    segmentationIds = [segmentationId];
  } else {
    // get all toolGroups
    segmentationIds = getSegmentations().map(
      ({ segmentationId }) => segmentationId
    );
  }

  // 1. Trigger an event notifying all listeners about the segmentationId
  // that has been updated.
  segmentationIds.forEach((segmentationId) => {
    const eventDetail: SegmentationModifiedEventDetail = {
      segmentationId,
    };
    triggerEvent(eventTarget, Events.SEGMENTATION_MODIFIED, eventDetail);
  });

  // Todo: I don't think we need the following lines of code
  // // 2. Notify all viewports that render the segmentationId in order to update the
  // // rendering based on the new global state.
  // toolGroupIds.forEach((toolGroupId) => {
  //   triggerSegmentationRepresentationModified(toolGroupId)
  // })
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
  // ToolGroup Specific
  triggerSegmentationRepresentationModified,
  triggerSegmentationRepresentationRemoved,
  // Global
  triggerSegmentationDataModified,
  triggerSegmentationModified,
  triggerSegmentationRemoved,
};
