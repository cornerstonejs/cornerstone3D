import SegmentationRepresentations from '../../enums/SegmentationRepresentations'
import { LabelmapDisplay } from '../../tools/displayTools/Labelmap'

import {
  getSegmentationState,
  getSegmentationDataByUID,
} from './segmentationState'

/**
 * Remove the segmentation data (representation) from the viewports of the toolGroup.
 * @param {string} toolGroupUID - The UID of the toolGroup to remove the segmentation from.
 * @param {SegmentationDataInput[]} segmentationDataArray - Array of segmentationData
 * containing at least volumeUID. If no representation type is provided, it will
 * assume the default labelmap representation should be removed from the viewports.
 */
function removeSegmentationsForToolGroup(
  toolGroupUID: string,
  segmentationDataUIDs?: string[] | undefined
): void {
  const toolGroupSegmentations = getSegmentationState(toolGroupUID)
  const toolGroupSegmentationDataUIDs = toolGroupSegmentations.map(
    (segData) => segData.segmentationDataUID
  )

  let segmentationDataUIDsToRemove = segmentationDataUIDs
  if (segmentationDataUIDsToRemove) {
    // make sure the segmentationDataUIDs that are going to be removed belong
    // to the toolGroup
    const invalidSegmentationDataUIDs = segmentationDataUIDs.filter(
      (segmentationDataUID) =>
        !toolGroupSegmentationDataUIDs.includes(segmentationDataUID)
    )

    if (invalidSegmentationDataUIDs.length > 0) {
      throw new Error(
        `You are trying to remove segmentationDataUIDs that are not in the toolGroup: segmentationDataUID: ${invalidSegmentationDataUIDs}`
      )
    }
  } else {
    // remove all segmentations
    segmentationDataUIDsToRemove = toolGroupSegmentationDataUIDs
  }

  segmentationDataUIDsToRemove.forEach((segmentationDataUID) => {
    _removeSegmentation(toolGroupUID, segmentationDataUID)
  })
}

function _removeSegmentation(
  toolGroupUID: string,
  segmentationDataUID: string
): void {
  const segmentationData = getSegmentationDataByUID(
    toolGroupUID,
    segmentationDataUID
  )

  const { representation } = segmentationData

  if (representation.type === SegmentationRepresentations.Labelmap) {
    LabelmapDisplay.removeSegmentationData(toolGroupUID, segmentationDataUID)
  } else {
    throw new Error(`The representation ${representation} is not supported`)
  }
}

export default removeSegmentationsForToolGroup
