import type { SegmentationRepresentations } from '../../enums';
import type { SegmentationRepresentation } from '../../types/SegmentationStateTypes';
import { defaultSegmentationStateManager } from './SegmentationStateManager';

/**
 * Retrieves segmentation representations for a specific segmentation in a given viewport.
 *
 * @param viewportId - The ID of the viewport.
 * @param segmentationId - The ID of the segmentation.
 * @returns An array of SegmentationRepresentation objects or an empty array if no representations are found.
 *
 * @remarks
 * This method filters the segmentation representations based on the provided specifier.
 * If no specifier is provided, it returns all segmentation representations for the viewport.
 * if only the segmentationId is provided, it returns all representations of the segmentation.
 * if only the type is provided, it returns all representations of the type.
 * if both the segmentationId and type are provided, it returns all representations of the segmentation with the given type
 * which will be an array of length 1
 */
export function getSegmentationRepresentations(
  viewportId: string,
  specifier: {
    segmentationId?: string;
    type?: SegmentationRepresentations;
  } = {}
): SegmentationRepresentation[] | [] {
  const segmentationStateManager = defaultSegmentationStateManager;

  return segmentationStateManager.getSegmentationRepresentations(
    viewportId,
    specifier
  );
}

/**
 * Retrieves a specific segmentation representation for a given viewport and specifier.
 *
 * @param viewportId - The ID of the viewport.
 * @param specifier - The specifier object containing segmentationId and type.
 * @returns A SegmentationRepresentation object if found, or undefined if not found.
 *
 */
export function getSegmentationRepresentation(
  viewportId: string,
  specifier: {
    segmentationId: string;
    type: SegmentationRepresentations;
  }
): SegmentationRepresentation | undefined {
  const segmentationStateManager = defaultSegmentationStateManager;

  if (!specifier.segmentationId || !specifier.type) {
    throw new Error(
      'getSegmentationRepresentation: No segmentationId or type provided, you need to provide at least one of them'
    );
  }

  const representations =
    segmentationStateManager.getSegmentationRepresentations(
      viewportId,
      specifier
    );

  return representations?.[0];
}

/**
 * Retrieves the segmentation representations associated with a given segmentation ID.
 *
 * @param segmentationId - The unique identifier for the segmentation.
 * @returns An array of `SegmentationRepresentation` objects associated with the specified segmentation ID.
 */
export function getSegmentationRepresentationsBySegmentationId(
  segmentationId: string
): { viewportId: string; representations: SegmentationRepresentation[] }[] {
  const segmentationStateManager = defaultSegmentationStateManager;
  return segmentationStateManager.getSegmentationRepresentationsBySegmentationId(
    segmentationId
  );
}
