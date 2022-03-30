import { isValidLabelmapConfig } from '../../tools/displayTools/Labelmap/labelmapConfig';
import SegmentationRepresentation from '../../enums/SegmentationRepresentations';
import { RepresentationConfig } from '../../types/SegmentationStateTypes';

/**
 * Given a representation type and a configuration, return true if the
 * configuration is valid for that representation type
 * @param representationType - The type of segmentation representation
 * @param config - RepresentationConfig
 * @returns A boolean value.
 */
export default function isValidRepresentationConfig(
  representationType: string,
  config: RepresentationConfig
): boolean {
  switch (representationType) {
    case SegmentationRepresentation.Labelmap:
      return isValidLabelmapConfig(config);
    default:
      throw new Error(`Unknown representation type: ${representationType}`);
  }
}
