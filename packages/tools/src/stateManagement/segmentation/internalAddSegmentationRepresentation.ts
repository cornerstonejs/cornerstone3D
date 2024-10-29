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

function internalAddSegmentationRepresentation(
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

/**
 * Retrieves or adds a Color Lookup Table (LUT) index based on the provided configuration.
 *
 * @param config - Configuration object containing colorLUTOrIndex.
 * @returns The index of the Color LUT to be used.
 */
function getColorLUTIndex(config: RepresentationPublicInput['config']): number {
  // Destructure colorLUTOrIndex from the config, with a fallback to undefined if config is undefined
  const { colorLUTOrIndex } = config || {};

  // Determine if colorLUTOrIndex is a numeric index or a Color LUT object
  const isIndexProvided = typeof colorLUTOrIndex === 'number';

  // If an index is provided, retrieve the corresponding Color LUT; otherwise, use the default Color LUT
  const selectedColorLUT: Types.ColorLUT = isIndexProvided
    ? getColorLUT(colorLUTOrIndex)
    : CORNERSTONE_COLOR_LUT;

  // Determine the Color LUT index:
  // - Use the provided index if available
  // - Otherwise, obtain the next available index
  const colorLUTIndex: number = isIndexProvided
    ? colorLUTOrIndex
    : getNextColorLUTIndex();

  // If a Color LUT object is provided instead of an index, add it to the state with the determined index
  if (!isIndexProvided) {
    addColorLUT(selectedColorLUT, colorLUTIndex);
  }

  return colorLUTIndex;
}

export { internalAddSegmentationRepresentation };
