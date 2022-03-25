import { triggerEvent, eventTarget } from '@cornerstonejs/core'

import { Events } from '../../enums'
import {
  getToolGroupsWithSegmentation,
  getSegmentationRepresentations,
} from '../../stateManagement/segmentation/segmentationState'
import {
  SegmentationRepresentationModifiedEventDetail,
  SegmentationDataModifiedEventDetail,
  SegmentationModifiedEventDetail,
} from '../../types/EventTypes'

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
  }

  if (segmentationRepresentationUID) {
    triggerEvent(
      eventTarget,
      Events.SEGMENTATION_REPRESENTATION_MODIFIED,
      eventDetail
    )
    return
  }

  // If no segmentationRepresentationUID is provided, then we need to trigger
  // the event for all segmentation representations in the toolGroup

  // Get all segmentation representations in the toolGroup
  const segmentationRepresentations =
    getSegmentationRepresentations(toolGroupId) || []

  segmentationRepresentations.forEach((segmentationRepresentation) => {
    const { segmentationRepresentationUID } = segmentationRepresentation
    const eventDetail: SegmentationRepresentationModifiedEventDetail = {
      toolGroupId,
      segmentationRepresentationUID,
    }

    triggerEvent(
      eventTarget,
      Events.SEGMENTATION_REPRESENTATION_MODIFIED,
      eventDetail
    )
  })
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
  let toolGroupIds, segmentationUIDs

  if (segmentationId) {
    toolGroupIds = getToolGroupsWithSegmentation(segmentationId)
    segmentationUIDs = [segmentationId]
  } else {
    // get all toolGroups
    toolGroupIds = getToolGroups()
    segmentationUIDs = getGlobalSegmentationState().map(
      ({ volumeId }) => volumeId
    )
  }

  // 1. Trigger an event notifying all listeners about the segmentationId
  // that has been updated.
  segmentationUIDs.forEach((segmentationId) => {
    const eventDetail: SegmentationModifiedEventDetail = {
      segmentationId,
    }
    triggerEvent(eventTarget, Events.SEGMENTATION_MODIFIED, eventDetail)
  })

  // Todo: I don't think we need the following line of code
  // // 2. Notify all viewports that render the segmentationId in order to update the
  // // rendering based on the new global state.
  // toolGroupIds.forEach((toolGroupId) => {
  //   triggerSegmentationRepresentationModified(toolGroupId)
  // })
}

/**
 * Trigger an event that a segmentation data has been modified
 * @param toolGroupId - The Id of the tool group that triggered the event.
 * @param segmentationDataUID - The id of the segmentation data that was modified.
 */
function triggerSegmentationDataModified(
  toolGroupId: string,
  segmentationDataUID: string
): void {
  const eventDetail: SegmentationDataModifiedEventDetail = {
    toolGroupId,
    segmentationDataUID,
  }

  triggerEvent(eventTarget, Events.SEGMENTATION_DATA_MODIFIED, eventDetail)
}

export {
  // ToolGroup Specific
  triggerSegmentationRepresentationModified,
  // Global
  triggerSegmentationDataModified,
  triggerSegmentationModified,
}
