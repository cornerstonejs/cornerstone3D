import SegmentationRepresentations from '../../enums/SegmentationRepresentations'
import { LabelmapDisplay } from '../../tools/displayTools/Labelmap'

import {
  getSegmentationState,
  getSegmentationDataByUID,
} from './segmentationState'

/**
 * Remove the segmentation data (representation) from the viewports of the toolGroup.
 * @param toolGroupId - The Id of the toolGroup to remove the segmentation from.
 * @param segmentationDataArray - Array of segmentationData
 * containing at least volumeId. If no representation type is provided, it will
 * assume the default labelmap representation should be removed from the viewports.
 */
function removeSegmentationsFromToolGroup(
  toolGroupId: string,
  segmentationDataUIDs?: string[] | undefined
): void {
  const toolGroupSegmentations = getSegmentationState(toolGroupId)
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
    _removeSegmentation(toolGroupId, segmentationDataUID)
  })
}

function _removeSegmentation(
  toolGroupId: string,
  segmentationDataUID: string
): void {
  const segmentationData = getSegmentationDataByUID(
    toolGroupId,
    segmentationDataUID
  )

  const { representation } = segmentationData

  if (representation.type === SegmentationRepresentations.Labelmap) {
    LabelmapDisplay.removeSegmentationData(toolGroupId, segmentationDataUID)
  } else {
    throw new Error(`The representation ${representation} is not supported`)
  }
}

export default removeSegmentationsFromToolGroup
