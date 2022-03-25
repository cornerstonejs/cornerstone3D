import { SegmentationRepresentations } from 'tools/src/enums'
import { SegmentationPublicInput } from '../../../types/SegmentationStateTypes'

/**
 * Checks if the segmentationInputArray is valid meaning it contains
 * correct representationProps for the representation type that is being used.
 *
 * @param segmentationInputArray - Array of segmentation inputs
 * @internal
 */
function validateSegmentationInputArray(
  segmentationInputArray: SegmentationPublicInput[]
): void {
  if (!segmentationInputArray || !segmentationInputArray.length) {
    throw new Error('The segmentationInputArray undefined or empty array')
  }

  segmentationInputArray.forEach((segmentationInput) => {
    if (segmentationInput.type === SegmentationRepresentations.Labelmap) {
      _validateLabelmapRepresentationProp(segmentationInput)
    }
  })
}

function _validateLabelmapRepresentationProp(
  segmentationInput: SegmentationPublicInput
): void {
  if (!segmentationInput.representationProps.volumeId) {
    throw new Error(
      'The segmentationInput.representationProps.volumeId is undefined'
    )
  }
}

export default validateSegmentationInputArray
