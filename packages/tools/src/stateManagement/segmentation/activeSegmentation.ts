import {
  getActiveSegmentationData,
  setActiveSegmentationData,
  getGlobalSegmentationDataByUID,
} from './segmentationState'

/**
 * Get the active segmentation info for the first viewport in the tool group with
 * the given toolGroupId.
 * @param toolGroupId - The Id of the tool group that the user is
 * currently interacting with.
 */
function getActiveSegmentationInfo(toolGroupId: string): {
  volumeId: string
  segmentationDataUID: string
  activeSegmentIndex: number
} {
  const activeSegmentationData = getActiveSegmentationData(toolGroupId)

  if (!activeSegmentationData) {
    return null
  }

  const globalState = getGlobalSegmentationDataByUID(
    activeSegmentationData.volumeId
  )

  return {
    volumeId: activeSegmentationData.volumeId,
    segmentationDataUID: activeSegmentationData.segmentationDataUID,
    activeSegmentIndex: globalState.activeSegmentIndex,
  }
}

/**
 * Set the active segmentation for the given tool group for all its viewports
 *
 * @param toolGroupId - The Id of the tool group to set the active
 * segmentation for.
 * @param segmentationDataUID - The UID of the segmentation data to set as
 * active.
 */
function setActiveSegmentation(
  toolGroupId: string,
  segmentationDataUID: string
): void {
  setActiveSegmentationData(toolGroupId, segmentationDataUID)
}

export {
  // get
  getActiveSegmentationInfo,
  // set
  setActiveSegmentation,
}
