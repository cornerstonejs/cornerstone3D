import type { SegmentationRepresentation } from '../../types/SegmentationStateTypes';
import { getSegmentationRepresentation } from './getSegmentationRepresentation';
import { getSegmentationRepresentationViewportStates } from './getSegmentationRepresentationViewportStates';

/**
 * Retrieves the segmentation representations for a given viewport.
 * @param viewportId - The ID of the viewport.
 * @returns An array of SegmentationRepresentation objects or an empty array if the viewport is not found.
 */
export function getSegmentationRepresentations(
  viewportId: string
): SegmentationRepresentation[] | [] {
  const viewportRenderingState =
    getSegmentationRepresentationViewportStates(viewportId);

  if (!viewportRenderingState) {
    return [];
  }

  const segRepUIDs = Object.keys(viewportRenderingState);

  return segRepUIDs
    .map((segRepUID) => getSegmentationRepresentation(segRepUID))
    .filter(Boolean);
}
