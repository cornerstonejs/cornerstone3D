import { invalidateBrushCursor } from '../../utilities/segmentation/';
import {
  getSegmentation,
  getToolGroupIdsWithSegmentation,
} from './segmentationState';
import { triggerSegmentationModified } from './triggerSegmentationEvents';

/**
 * Set the active segment index for a segmentation Id. It fires a global state
 * modified event. Also it invalidates the brush cursor for all toolGroups that
 * has the segmentationId as active segment (since the brush cursor color
 * should change as well)
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

  if (typeof segmentIndex === 'string') {
    console.warn('segmentIndex is a string, converting to number');
    segmentIndex = Number(segmentIndex);
  }

  if (segmentation?.activeSegmentIndex !== segmentIndex) {
    segmentation.activeSegmentIndex = segmentIndex;

    triggerSegmentationModified(segmentationId);
  }

  // get all toolGroups that has the segmentationId as active
  // segment and call invalidateBrushCursor on them
  const toolGroups = getToolGroupIdsWithSegmentation(segmentationId);
  toolGroups.forEach((toolGroupId) => {
    invalidateBrushCursor(toolGroupId);
  });
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

export { getActiveSegmentIndex, setActiveSegmentIndex };
