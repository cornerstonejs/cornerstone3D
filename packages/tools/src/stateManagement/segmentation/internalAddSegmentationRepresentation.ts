import type { Types } from '@cornerstonejs/core';
import type {
  RenderingConfig,
  RepresentationPublicInput,
} from '../../types/SegmentationStateTypes';
import CORNERSTONE_COLOR_LUT from '../../constants/COLOR_LUT';
import { triggerAnnotationRenderForViewportIds } from '../../utilities/triggerAnnotationRenderForViewportIds';
import { SegmentationRepresentations } from '../../enums';
import { triggerSegmentationModified } from './triggerSegmentationEvents';
import { addColorLUT } from './addColorLUT';
import { getNextColorLUTIndex } from './getNextColorLUTIndex';
import { defaultSegmentationStateManager } from './SegmentationStateManager';
import { getColorLUT } from './getColorLUT';

async function internalAddSegmentationRepresentation(
  viewportId: string,
  representationInput: RepresentationPublicInput
) {
  const { segmentationId, config } = representationInput;

  // need to be able to override from the outside
  const renderingConfig: RenderingConfig = {
    colorLUTIndex: getColorLUTIndex(config),
  };

  defaultSegmentationStateManager.addSegmentationRepresentation(
    viewportId,
    segmentationId,
    representationInput.type,
    renderingConfig
  );

  if (representationInput.type === SegmentationRepresentations.Contour) {
    triggerAnnotationRenderForViewportIds([viewportId]);
  }

  triggerSegmentationModified(segmentationId);
}

function getColorLUTIndex(config: RepresentationPublicInput['config']) {
  const colorLUT = config?.colorLUT;

  const nextIndex = getNextColorLUTIndex();
  const colorLUTToAdd = Array.isArray(colorLUT)
    ? colorLUT
    : CORNERSTONE_COLOR_LUT;

  // in any case add the colorLUT to the state
  addColorLUT(colorLUTToAdd as Types.ColorLUT, nextIndex);

  const colorLUTIndex = nextIndex;

  if (!getColorLUT(colorLUTIndex)) {
    throw new Error(`Color LUT with index ${colorLUTIndex} not found`);
  }
  return colorLUTIndex;
}

export { internalAddSegmentationRepresentation };
