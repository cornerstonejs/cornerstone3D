import { getSegmentation } from './getSegmentation';

/**
 * Get the active segment index for a segmentation in the global state
 * @param segmentationId - The id of the segmentation to get the active segment index from.
 * @returns The active segment index for the given segmentation.
 */
export function getActiveSegmentIndex(
  segmentationId: string
): number | undefined {
  const segmentation = getSegmentation(segmentationId);

  if (segmentation) {
    return segmentation.activeSegmentIndex;
  }
}
