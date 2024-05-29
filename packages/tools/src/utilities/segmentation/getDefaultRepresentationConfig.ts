import getDefaultLabelmapConfig from '../../tools/displayTools/Labelmap/labelmapConfig.js';
import SegmentationRepresentation from '../../enums/SegmentationRepresentations.js';
import { Segmentation } from '../../types/SegmentationStateTypes.js';

/**
 * It returns a configuration object for the given representation type.
 * @param representationType - The type of segmentation representation
 * @returns A representation configuration object.
 */
export default function getDefaultRepresentationConfig(
  segmentation: Segmentation
) {
  const { type: representationType } = segmentation;
  switch (representationType) {
    case SegmentationRepresentation.Labelmap:
      return getDefaultLabelmapConfig();
    default:
      throw new Error(`Unknown representation type: ${representationType}`);
  }
}
