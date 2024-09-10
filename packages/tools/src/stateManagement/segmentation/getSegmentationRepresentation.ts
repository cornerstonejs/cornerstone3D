import type { SegmentationRepresentations } from '../../enums';
import type { SegmentationRepresentation } from '../../types/SegmentationStateTypes';
import { defaultSegmentationStateManager } from './SegmentationStateManager';

/**
 * Retrieves all segmentation representations for a given viewport.
 *
 * @param viewportId - The ID of the viewport.
 * @returns An array of SegmentationRepresentation objects or an empty array if no representations are found.
 */
export function getAllSegmentationRepresentations(
  viewportId: string
): SegmentationRepresentation[] | [] {
  const segmentationStateManager = defaultSegmentationStateManager;

  return segmentationStateManager.getSegmentationRepresentations(
    viewportId,
    {}
  );
}

/**
 * Retrieves segmentation representations for a specific segmentation in a given viewport.
 *
 * @param viewportId - The ID of the viewport.
 * @param segmentationId - The ID of the segmentation.
 * @returns An array of SegmentationRepresentation objects or an empty array if no representations are found.
 */
export function getSegmentationRepresentations(
  viewportId: string,
  segmentationId: string
): SegmentationRepresentation[] | [] {
  const segmentationStateManager = defaultSegmentationStateManager;

  return segmentationStateManager.getSegmentationRepresentations(viewportId, {
    segmentationId,
  });
}

/**
 * Retrieves a specific segmentation representation for a given viewport, segmentation, and type.
 *
 * @param viewportId - The ID of the viewport.
 * @param segmentationId - The ID of the segmentation.
 * @param type - The type of segmentation representation.
 * @returns A SegmentationRepresentation object if found, or undefined if not found.
 */
export function getSegmentationRepresentation(
  viewportId: string,
  segmentationId: string,
  type: SegmentationRepresentations
): SegmentationRepresentation | undefined {
  const segmentationStateManager = defaultSegmentationStateManager;

  const representations =
    segmentationStateManager.getSegmentationRepresentations(viewportId, {
      segmentationId,
      type,
    });

  return representations[0];
}
