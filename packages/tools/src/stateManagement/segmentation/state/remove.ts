import {
  triggerSegmentationRemoved,
  triggerSegmentationRepresentationRemoved,
} from '../triggerSegmentationEvents';
import { getDefaultSegmentationStateManager } from './get';

/**
 * It removes the segmentation from the segmentation state manager
 *
 * @triggers SEGMENTATION_REMOVED
 *
 * @param segmentationId - The id of the segmentation
 */
function removeSegmentation(segmentationId: string): void {
  const segmentationStateManager = getDefaultSegmentationStateManager();
  segmentationStateManager.removeSegmentation(segmentationId);
  triggerSegmentationRemoved(segmentationId);
}

/**
 * Remove a segmentation representation from the segmentation state manager for a toolGroup.
 * It fires SEGMENTATION_REPRESENTATION_MODIFIED event.
 *
 * @triggers SEGMENTATION_REPRESENTATION_REMOVED
 *
 * @param toolGroupId - The Id of the tool group that the segmentation
 * data belongs to.
 * @param segmentationRepresentationUID - The uid of the segmentation representation to remove.
 * remove.
 * @param - immediate - If true, the viewports will be updated immediately.
 */
function removeSegmentationRepresentation(
  toolGroupId: string,
  segmentationRepresentationUID: string
): void {
  const segmentationStateManager = getDefaultSegmentationStateManager();
  segmentationStateManager.removeSegmentationRepresentation(
    toolGroupId,
    segmentationRepresentationUID
  );

  triggerSegmentationRepresentationRemoved(
    toolGroupId,
    segmentationRepresentationUID
  );
}

/**
 * Add a color LUT to the segmentation state manager
 * @param colorLUT - The color LUT array to add.
 * @param index - The index of the color LUT to add.
 */
function removeColorLUT(colorLUTIndex: number): void {
  const segmentationStateManager = getDefaultSegmentationStateManager();
  segmentationStateManager.removeColorLUT(colorLUTIndex);
}

export { removeSegmentation, removeSegmentationRepresentation, removeColorLUT };
