import SegmentationRepresentations from '../../../enums/SegmentationRepresentations';
import { RepresentationPublicInput } from '../../../types';
import { getSegmentationRepresentationRenderingConfig as getLabelmapRenderingConfig } from '../../../tools/displayTools/Labelmap/labelmapDisplay';

export function getSegmentationRepresentationRenderingConfig(
  representationInput: RepresentationPublicInput
) {
  const { type } = representationInput;

  if (type === SegmentationRepresentations.Labelmap) {
    return getLabelmapRenderingConfig();
  } else {
    return {};
  }
}
