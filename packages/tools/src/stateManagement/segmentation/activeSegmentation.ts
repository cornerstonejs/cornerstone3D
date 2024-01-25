import { ToolGroupSpecificRepresentation } from '../../types/SegmentationStateTypes';
import {
  getDefaultSegmentationStateManager,
  getSegmentation,
} from './segmentationState';
import { triggerSegmentationRepresentationModified } from './triggerSegmentationEvents';

/**
 * Get the active segmentation representation for the tool group with
 * the given toolGroupId.
 * @param toolGroupId - The Id of the tool group
 * @returns The active segmentation representation for the tool group.
 */
function getActiveSegmentationRepresentation(
  toolGroupId: string
): ToolGroupSpecificRepresentation {
  const segmentationStateManager = getDefaultSegmentationStateManager();

  const toolGroupSegmentationRepresentations =
    segmentationStateManager.getSegmentationRepresentations(toolGroupId);

  if (!toolGroupSegmentationRepresentations) {
    return;
  }

  const activeRepresentation = toolGroupSegmentationRepresentations.find(
    (representation) => representation.active
  );

  return activeRepresentation;
}

/**
 * Retrieves the active segmentation for a given tool group.
 * @param toolGroupId - The ID of the tool group.
 * @returns The active segmentation Id, or undefined if no active segmentation is found.
 */
function getActiveSegmentation(toolGroupId: string) {
  const activeRepresentation = getActiveSegmentationRepresentation(toolGroupId);

  if (!activeRepresentation) {
    return;
  }

  const activeSegmentation = getSegmentation(
    activeRepresentation.segmentationId
  );

  return activeSegmentation;
}

/**
 * Set the active segmentation for the given tool group for all its viewports
 *
 * @param toolGroupId - The Id of the tool group to set the active
 * segmentation for.
 * @param segmentationRepresentationUID - The id of the segmentation representation to set as
 * active.
 */
function setActiveSegmentationRepresentation(
  toolGroupId: string,
  segmentationRepresentationUID: string
): void {
  const segmentationStateManager = getDefaultSegmentationStateManager();

  segmentationStateManager.setActiveSegmentationRepresentation(
    toolGroupId,
    segmentationRepresentationUID
  );

  triggerSegmentationRepresentationModified(
    toolGroupId,
    segmentationRepresentationUID
  );
}

export {
  // get
  getActiveSegmentationRepresentation,
  getActiveSegmentation,
  // set
  setActiveSegmentationRepresentation,
};
