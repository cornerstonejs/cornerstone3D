import { SegmentationDataInput } from '../../../types/SegmentationStateTypes'

/**
 * Checks if the segmentationDataArray is valid meaning it contains
 * volumeId of the segmentation.
 *
 * @param segmentationDataArray - Array of segmentationData
 * @internal
 */
function checkSegmentationDataIsValid(
  segmentationDataArray: SegmentationDataInput[]
): void {
  if (!segmentationDataArray || !segmentationDataArray.length) {
    throw new Error('The segmentationDataArray undefined or empty array')
  }

  // check if volumeId is present in all the segmentationDataArray
  segmentationDataArray.forEach((segmentationData) => {
    if (!segmentationData.volumeId) {
      throw new Error('volumeId is missing in the segmentationData')
    }
  })
}

export default checkSegmentationDataIsValid
