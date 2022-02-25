import { SegmentationDataInput } from '../../types/SegmentationStateTypes'

/**
 * Checks if the segmentationDataArray is valid meaning it contains
 * volumeUID of the segmentation.
 * @param {Partial<ViewportSpecificSegmentationData>[]} segmentationDataArray
 */
function checkSegmentationDataIsValid(
  segmentationDataArray: SegmentationDataInput[]
): void {
  if (!segmentationDataArray || !segmentationDataArray.length) {
    throw new Error('The segmentationDataArray undefined or empty array')
  }

  // check if volumeUID is present in all the segmentationDataArray
  segmentationDataArray.forEach((segmentationData) => {
    if (!segmentationData.volumeUID) {
      throw new Error('volumeUID is missing in the segmentationData')
    }
  })
}

export { checkSegmentationDataIsValid }
