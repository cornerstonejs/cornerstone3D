import type { SegmentationRepresentations } from '../../enums';
import addRepresentationData from '../../stateManagement/segmentation/internalAddRepresentationData';

/**
 * Computes a segmentation representation and subscribes to future segmentation updates.
 *
 * @param segmentationId - The ID of the segmentation.
 * @param type - Representation type (e.g., LABELMAP, CONTOUR).
 * @param computeFunction - Async function that computes representation data.
 * @param onComputationComplete - Optional callback invoked after computation completes.
 * @returns - A promise that resolves with the computed representation data.
 */
async function computeAndAddRepresentation<T>(
  segmentationId: string,
  type: SegmentationRepresentations,
  computeFunction: () => Promise<T>,
  onComputationComplete?: () => void
): Promise<T> {
  // Compute the specific representation data
  const data = await computeFunction();
  // Add the computed data to the system
  addRepresentationData({
    segmentationId,
    type,
    data,
  });

  onComputationComplete?.();

  return data;
}

export { computeAndAddRepresentation };
