import * as Enums from '../../../enums';
import { SegmentationPublicInput } from '../../../types/SegmentationStateTypes';
import { validatePublic as validatePublicLabelmap } from '../../../tools/displayTools/Labelmap/validateLabelmap';

/**
 * Validates the given segmentationInputArray to ensure it contains
 * appropriate representationProps for the representation type being used.
 *
 * @param segmentationInputArray - Array of segmentation inputs
 * @throws If the segmentationInputArray is undefined or empty
 * @throws If the segmentationInput.segmentationId is undefined
 * @throws If the segmentationInput.representation is undefined
 * @internal
 */
function validateSegmentationInput(
  segmentationInputArray: SegmentationPublicInput[]
): void {
  if (!segmentationInputArray || segmentationInputArray.length === 0) {
    throw new Error(
      'The segmentationInputArray is undefined or an empty array'
    );
  }

  segmentationInputArray.forEach((segmentationInput) => {
    if (segmentationInput.segmentationId === undefined) {
      throw new Error(
        'Undefined segmentationInput.segmentationId. Please provide a valid segmentationId'
      );
    }

    if (segmentationInput.representation === undefined) {
      throw new Error(
        'Undefined segmentationInput.representation. Please provide a valid representation'
      );
    }

    if (
      segmentationInput.representation.type ===
      Enums.SegmentationRepresentations.Labelmap
    ) {
      validatePublicLabelmap(segmentationInput);
    }
  });
}

export default validateSegmentationInput;
