import { triggerEvent, eventTarget } from '@precisionmetrics/cornerstone-render'

import { CornerstoneTools3DEvents as EVENTS } from '../../enums'
import {
  getToolGroupsWithSegmentation,
  getToolGroups,
  getGlobalSegmentationState,
} from '../../stateManagement/segmentation/segmentationState'

/**
 * Trigger an event on the viewport elements that the segmentation state has been
 * updated
 * @param enabledElement - The enabled element that has been updated.
 */
function triggerSegmentationStateModified(toolGroupUID: string): void {
  const eventData = {
    toolGroupUID,
  }

  triggerEvent(eventTarget, EVENTS.SEGMENTATION_STATE_MODIFIED, eventData)
}

function triggerSegmentationGlobalStateModified(
  segmentationUID?: string
): void {
  let toolGroupUIDs, segmentationUIDs

  if (segmentationUID) {
    toolGroupUIDs = getToolGroupsWithSegmentation(segmentationUID)
    segmentationUIDs = [segmentationUID]
  } else {
    // get all toolGroups
    toolGroupUIDs = getToolGroups()
    segmentationUIDs = getGlobalSegmentationState().map(
      ({ volumeUID }) => volumeUID
    )
  }

  // 1. Trigger an event notifying all listeners about the segmentationUID
  // that has been updated.
  triggerEvent(eventTarget, EVENTS.SEGMENTATION_GLOBAL_STATE_MODIFIED, {
    segmentationUIDs,
  })

  // 2. Notify all viewports that render the segmentationUID in order to update the
  // rendering based on the new global state.
  toolGroupUIDs.forEach((toolGroupUID) => {
    triggerSegmentationStateModified(toolGroupUID)
  })
}

function triggerSegmentationDataModified(
  toolGroupUID: string,
  segmentationDataUID: string
): void {
  const eventDetail = {
    toolGroupUID,
    segmentationDataUID,
  }

  triggerEvent(eventTarget, EVENTS.SEGMENTATION_DATA_MODIFIED, eventDetail)
}

export {
  // ToolGroup Specific
  triggerSegmentationStateModified,
  // Global
  triggerSegmentationDataModified,
  triggerSegmentationGlobalStateModified,
}
