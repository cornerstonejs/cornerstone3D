import { getDefaultSegmentationStateManager } from './get';
import {
  triggerSegmentationModified,
  triggerSegmentationRepresentationModified,
} from '../triggerSegmentationEvents';

import type {
  ColorLUT,
  SegmentationPublicInput,
  ToolGroupSpecificRepresentation,
} from '../../../types/SegmentationStateTypes';

import normalizeSegmentationInput from '../helpers/normalizeSegmentationInput';

/**
 * It takes a segmentation input and adds it to the segmentation state manager
 * @param segmentationInput - The segmentation to add.
 * @param suppressEvents - If true, the event will not be triggered.
 */
function addSegmentation(
  segmentationInput: SegmentationPublicInput,
  suppressEvents?: boolean
): void {
  const segmentationStateManager = getDefaultSegmentationStateManager();

  const segmentation = normalizeSegmentationInput(segmentationInput);

  segmentationStateManager.addSegmentation(segmentation);

  if (!suppressEvents) {
    triggerSegmentationModified(segmentation.segmentationId);
  }
}

/**
 * Add the given segmentation representation data to the given tool group state. It fires
 * SEGMENTATION_REPRESENTATION_MODIFIED event if not suppressed.
 *
 * @triggers SEGMENTATION_REPRESENTATION_MODIFIED
 *
 * @param toolGroupId - The Id of the tool group that the segmentation representation is for.
 * @param segmentationData - The data to add to the segmentation state.
 * @param suppressEvents - boolean
 */
function addSegmentationRepresentation(
  toolGroupId: string,
  segmentationRepresentation: ToolGroupSpecificRepresentation,
  suppressEvents?: boolean
): void {
  const segmentationStateManager = getDefaultSegmentationStateManager();
  segmentationStateManager.addSegmentationRepresentation(
    toolGroupId,
    segmentationRepresentation
  );

  if (!suppressEvents) {
    triggerSegmentationRepresentationModified(
      toolGroupId,
      segmentationRepresentation.segmentationRepresentationUID
    );
  }
}

/**
 * Add a color LUT to the segmentation state manager
 * @param colorLUT - The color LUT array to add.
 * @param index - The index of the color LUT to add.
 */
function addColorLUT(colorLUT: ColorLUT, index: number): void {
  const segmentationStateManager = getDefaultSegmentationStateManager();
  segmentationStateManager.addColorLUT(colorLUT, index);
  // Todo: trigger event color LUT added
}

export { addSegmentation, addSegmentationRepresentation, addColorLUT };
