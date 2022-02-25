import { triggerSegmentationStateModified } from './triggerSegmentationEvents'
import { getSegmentationState } from '../../stateManagement/segmentation/segmentationState'
import { ToolGroupSpecificSegmentationData } from '../../types/SegmentationStateTypes'

/**
 * Set the visibility of a segmentation data for a given tool group. It fires
 * a SEGMENTATION_STATE_MODIFIED event.
 *
 * @event {SEGMENTATION_STATE_MODIFIED}
 * @param {string} toolGroupUID - The UID of the tool group that contains the
 * segmentation.
 * @param {string} segmentationDataUID - The UID of the segmentation data to
 * modify its visibility.
 * @param {boolean} visibility - boolean
 */
function setSegmentationVisibility(
  toolGroupUID: string,
  segmentationDataUID: string,
  visibility: boolean
): void {
  const toolGroupSegmentations = getSegmentationState(toolGroupUID)

  if (!toolGroupSegmentations) {
    return
  }

  toolGroupSegmentations.forEach(
    (segmentationData: ToolGroupSpecificSegmentationData) => {
      if (segmentationData.segmentationDataUID === segmentationDataUID) {
        segmentationData.visibility = visibility
        triggerSegmentationStateModified(toolGroupUID)
      }
    }
  )
}

/**
 * Get the visibility of a segmentation data for a given tool group.
 *
 * @param {string} toolGroupUID - The UID of the tool group that the segmentation
 * data belongs to.
 * @param {string} segmentationDataUID - The UID of the segmentation data to get
 * @returns A boolean value that indicates whether the segmentation data is visible or
 * not on the toolGroup
 */
function getSegmentationVisibility(
  toolGroupUID: string,
  segmentationDataUID: string
): boolean | undefined {
  const toolGroupSegmentations = getSegmentationState(toolGroupUID)

  const segmentationData = toolGroupSegmentations.find(
    (segmentationData: ToolGroupSpecificSegmentationData) =>
      segmentationData.segmentationDataUID === segmentationDataUID
  )

  if (!segmentationData) {
    return
  }

  return segmentationData.visibility
}

export default { setSegmentationVisibility, getSegmentationVisibility }
export { setSegmentationVisibility, getSegmentationVisibility }
