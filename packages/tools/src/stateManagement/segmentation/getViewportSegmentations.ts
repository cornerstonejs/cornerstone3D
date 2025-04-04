import type { SegmentationRepresentations } from '../../enums';
import type { Segmentation, SegmentationRepresentation } from '../../types';
import { getSegmentation } from './getSegmentation';
import { defaultSegmentationStateManager } from './SegmentationStateManager';

/**
 * Retrieves the segmentations for a given viewport and type.
 * @param viewportId - The ID of the viewport.
 * @param type - The type of the segmentation representation.
 * @returns An array of segmentations for the given viewport and type.
 */
export function getViewportSegmentations(
  viewportId: string,
  type?: SegmentationRepresentations
): Segmentation[] {
  const viewportRepresentations =
    getViewportSegmentationRepresentations(viewportId);

  const segmentations = viewportRepresentations.map((representation) => {
    if (type && representation.type === type) {
      return getSegmentation(representation.segmentationId);
    }

    return getSegmentation(representation.segmentationId);
  });

  const filteredSegmentations = segmentations.filter(
    (segmentation) => segmentation !== undefined
  );

  return filteredSegmentations;
}

export function getViewportSegmentationRepresentations(
  viewportId: string
): SegmentationRepresentation[] {
  const segmentationStateManager = defaultSegmentationStateManager;
  const state = segmentationStateManager.getState();

  const viewportRepresentations = state.viewportSegRepresentations[viewportId];

  return viewportRepresentations;
}
