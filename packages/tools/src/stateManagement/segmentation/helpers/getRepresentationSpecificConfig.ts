import SegmentationRepresentations from '../../../enums/SegmentationRepresentations.js';
import { RepresentationPublicInput } from '../../../types/index.js';
import { getRepresentationRenderingConfig as getLabelmapRenderingConfig } from '../../../tools/displayTools/Labelmap/labelmapDisplay.js';

export function getRepresentationSpecificConfig(
  representationInput: RepresentationPublicInput
) {
  const { type } = representationInput;

  if (type === SegmentationRepresentations.Labelmap) {
    return getLabelmapRenderingConfig();
  } else {
    return {};
  }
}
