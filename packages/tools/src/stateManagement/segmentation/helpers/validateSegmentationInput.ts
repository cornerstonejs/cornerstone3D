import * as Enums from '../../../enums';
import { SegmentationPublicInput } from '../../../types/SegmentationStateTypes';
import validateLabelmap from '../../../tools/displayTools/Labelmap/validateRepresentationData';

/**
 * Checks if the segmentationInputArray is valid meaning it contains
 * correct representationProps for the representation type that is being used.
 *
 * @param segmentationInputArray - Array of segmentation inputs
 * @internal
 */
function validateSegmentationInput(
  segmentationInputArray: SegmentationPublicInput[]
): void {
  if (!segmentationInputArray || !segmentationInputArray.length) {
    throw new Error('The segmentationInputArray is undefined or empty array');
  }

  segmentationInputArray.forEach((segmentationInput) => {
    if (segmentationInput.segmentationId === undefined) {
      throw new Error(
        'The segmentationInput.segmentationId is undefined, please provide a valid segmentationId'
      );
    }

    if (segmentationInput.representation === undefined) {
      throw new Error(
        'The segmentationInput.representation is undefined, please provide a valid representation'
      );
    }

    if (
      segmentationInput.representation.type ===
      Enums.SegmentationRepresentations.Labelmap
    ) {
      validateLabelmap(segmentationInput);
    }
  });
}

export default validateSegmentationInput;
