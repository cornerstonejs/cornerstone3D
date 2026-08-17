import { getEnabledElementByViewportId, utilities } from '@cornerstonejs/core';
import type {
  RenderingConfig,
  RepresentationPublicInput,
} from '../../types/SegmentationStateTypes';
import CORNERSTONE_COLOR_LUT from '../../constants/COLOR_LUT';
import { triggerAnnotationRenderForViewportIds } from '../../utilities/triggerAnnotationRenderForViewportIds';
import { SegmentationRepresentations } from '../../enums';
import {
  triggerSegmentationModified,
  triggerSegmentationDataModified,
} from './triggerSegmentationEvents';
import { addColorLUT } from './addColorLUT';
import { defaultSegmentationStateManager } from './SegmentationStateManager';
import { isSegmentationOverlayCompatible } from './helpers/isSegmentationOverlayCompatible';
import { addDefaultSegmentationListener } from './segmentationEventManager';
import { getActiveSegmentIndex, setActiveSegmentIndex } from './segmentIndex';

function internalAddSegmentationRepresentation(
  viewportId: string,
  representationInput: RepresentationPublicInput
) {
  const { segmentationId, config } = representationInput;

  // Only associate the overlay with a viewport it is compatible with (see
  // isSegmentationOverlayCompatible for the per-viewport-type rules): an
  // incompatible viewport can mount nothing useful, yet the forced re-render of
  // it in the shared rendering engine blanks the unrelated series.
  if (
    !isSegmentationOverlayCompatible(
      getEnabledElementByViewportId(viewportId)?.viewport,
      segmentationId,
      representationInput.type
    )
  ) {
    console.warn(
      `Skipping ${representationInput.type} representation of segmentation "${segmentationId}" on viewport "${viewportId}": the viewport is not a compatible destination for it.`
    );
    return;
  }

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

  const { viewport } = getEnabledElementByViewportId(viewportId) || {};

  if (viewport) {
    addDefaultSegmentationListener(
      viewport,
      segmentationId,
      representationInput.type
    );
  }

  // Initialize the active segment index to the first available segment if none is currently set
  if (!getActiveSegmentIndex(segmentationId)) {
    let firstSegmentIndex = 1;
    const segmentation =
      defaultSegmentationStateManager.getSegmentation(segmentationId);

    if (segmentation) {
      const segmentKeys = Object.keys(segmentation.segments);
      if (segmentKeys.length > 0) {
        firstSegmentIndex = segmentKeys.map((k) => Number(k)).sort()[0];
        setActiveSegmentIndex(segmentationId, firstSegmentIndex);
      }
    }
  }

  if (representationInput.type === SegmentationRepresentations.Contour) {
    triggerAnnotationRenderForViewportIds([viewportId]);
  }

  if (representationInput.type === SegmentationRepresentations.Surface) {
    triggerSegmentationDataModified(segmentationId);
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
    const index = addColorLUT(utilities.deepClone(CORNERSTONE_COLOR_LUT));
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
  const index = addColorLUT(utilities.deepClone(CORNERSTONE_COLOR_LUT));
  return index;
}

export { internalAddSegmentationRepresentation };
