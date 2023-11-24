import { getSegmentation } from './segmentationState';
import { triggerSegmentationModified } from './triggerSegmentationEvents';

/**
 * Set the active segment index for a segmentation Id. It fires a global state
 * modified event.
 *
 * @triggers SEGMENTATION_MODIFIED
 * @param segmentationId - The id of the segmentation that the segment belongs to.
 * @param segmentIndex - The index of the segment to be activated.
 */
function setActiveSegmentIndex(
  segmentationId: string,
  segmentIndex: number
): void {
  const segmentation = getSegmentation(segmentationId);

  if (segmentation?.activeSegmentIndex !== segmentIndex) {
    segmentation.activeSegmentIndex = segmentIndex;

    triggerSegmentationModified(segmentationId);
  }
}

function setPreviewSegmentIndex(segmentationId, segmentIndex: number) {
  const segmentation = getSegmentation(segmentationId);

  if (segmentation?.activeSegmentIndex !== segmentIndex) {
    segmentation.previewSegmentIndex = segmentIndex;

    triggerSegmentationModified(segmentationId);
  }
}

function getPreviewSegmentIndex(
  segmentationId,
  segmentationIndex?: number
): number | undefined {
  const segmentation = getSegmentation(segmentationId);

  if (segmentation) {
    return segmentation.previewSegmentIndex;
  }
}

/**
 * Get the active segment index for a segmentation in the global state
 * @param segmentationId - The id of the segmentation to get the active segment index from.
 * @returns The active segment index for the given segmentation.
 */
function getActiveSegmentIndex(segmentationId: string): number | undefined {
  const segmentation = getSegmentation(segmentationId);

  if (segmentation) {
    return segmentation.activeSegmentIndex;
  }
}

export {
  getActiveSegmentIndex,
  setActiveSegmentIndex,
  getPreviewSegmentIndex,
  setPreviewSegmentIndex,
};
