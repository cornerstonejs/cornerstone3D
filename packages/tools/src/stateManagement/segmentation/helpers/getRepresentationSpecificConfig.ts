import SegmentationRepresentations from '../../../enums/SegmentationRepresentations';
import { RepresentationPublicInput } from '../../../types';
import { getRepresentationRenderingConfig as getLabelmapRenderingConfig } from '../../../tools/displayTools/Labelmap/labelmapDisplay';

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
