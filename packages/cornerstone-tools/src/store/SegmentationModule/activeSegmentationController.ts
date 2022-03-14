import {
  getActiveSegmentationData,
  setActiveSegmentationData,
  getGlobalSegmentationDataByUID,
} from '../../stateManagement/segmentation/segmentationState'

/**
 * Get the active segmentation info for the first viewport in the tool group with
 * the given toolGroupUID.
 * @param toolGroupUID - The UID of the tool group that the user is
 * currently interacting with.
 */
function getActiveSegmentationInfo(toolGroupUID: string): {
  volumeUID: string
  segmentationDataUID: string
  activeSegmentIndex: number
} {
  const activeSegmentationData = getActiveSegmentationData(toolGroupUID)

  if (!activeSegmentationData) {
    return null
  }

  const globalState = getGlobalSegmentationDataByUID(
    activeSegmentationData.volumeUID
  )

  return {
    volumeUID: activeSegmentationData.volumeUID,
    segmentationDataUID: activeSegmentationData.segmentationDataUID,
    activeSegmentIndex: globalState.activeSegmentIndex,
  }
}

/**
 * Set the active segmentation for the given tool group for all its viewports
 *
 * @param toolGroupUID - The ID of the tool group to set the active
 * segmentation for.
 * @param segmentationDataUID - The UID of the segmentation data to set as
 * active.
 */
function setActiveSegmentation(
  toolGroupUID: string,
  segmentationDataUID: string
): void {
  setActiveSegmentationData(toolGroupUID, segmentationDataUID)
}

export {
  // get
  getActiveSegmentationInfo,
  // set
  setActiveSegmentation,
}

export default {
  // get
  getActiveSegmentationInfo,
  // set
  setActiveSegmentation,
}
