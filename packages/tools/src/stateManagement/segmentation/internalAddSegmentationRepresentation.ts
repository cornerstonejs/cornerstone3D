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
import { defaultSegmentationStateManager } from './SegmentationStateManager';

function internalAddSegmentationRepresentation(
  viewportId: string,
  representationInput: RepresentationPublicInput
) {
  const { segmentationId, config } = representationInput;

  // need to be able to override from the outside
  const renderingConfig: RenderingConfig = {
    colorLUTIndex: getColorLUTIndex(config),
    ...config,
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

/**
 * Retrieves or adds a Color Lookup Table (LUT) index based on the provided configuration.
 *
 * @param config - Configuration object containing colorLUTOrIndex.
 * @returns The index of the Color LUT to be used.
 */
function getColorLUTIndex(config: RepresentationPublicInput['config']): number {
  // Destructure colorLUTOrIndex from the config, with a fallback to undefined if config is undefined
  const { colorLUTOrIndex } = config || {};

  // If no colorLUTOrIndex provided, get next available index and add default LUT
  if (colorLUTOrIndex === undefined) {
    const index = addColorLUT(
      JSON.parse(JSON.stringify(CORNERSTONE_COLOR_LUT))
    );
    return index;
  }

  // If numeric index provided, return it directly
  if (typeof colorLUTOrIndex === 'number') {
    return colorLUTOrIndex;
  }

  // If colorLUTOrIndex is a ColorLUT array, add it with a new index
  if (
    Array.isArray(colorLUTOrIndex) &&
    colorLUTOrIndex.every((item) => Array.isArray(item) && item.length === 4)
  ) {
    const index = addColorLUT(colorLUTOrIndex);
    return index;
  }

  // Fallback: use default LUT with next available index
  const index = addColorLUT(JSON.parse(JSON.stringify(CORNERSTONE_COLOR_LUT)));
  return index;
}

export { internalAddSegmentationRepresentation };
