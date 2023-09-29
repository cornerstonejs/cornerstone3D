import { defaultSegmentationStateManager } from '../SegmentationStateManager';

import type {
  ColorLUT,
  RepresentationConfig,
  Segmentation,
  SegmentationRepresentationConfig,
  ToolGroupSpecificRepresentation,
  ToolGroupSpecificRepresentations,
} from '../../../types/SegmentationStateTypes';

/**
 * It returns the defaultSegmentationStateManager.
 */
function getDefaultSegmentationStateManager() {
  return defaultSegmentationStateManager;
}

/**
 * Get the segmentation for the given segmentationId
 * @param segmentationId - The Id of the segmentation
 * @returns A GlobalSegmentationData object
 */
function getSegmentation(segmentationId: string): Segmentation | undefined {
  const segmentationStateManager = getDefaultSegmentationStateManager();
  return segmentationStateManager.getSegmentation(segmentationId);
}

/**
 * Get the segmentations inside the state
 * @returns Segmentation array
 */
function getSegmentations(): Segmentation[] | [] {
  const segmentationStateManager = getDefaultSegmentationStateManager();
  const state = segmentationStateManager.getState();

  return state.segmentations;
}

/**
 * Get the segmentation state for a tool group. It will return an array of
 * segmentation representation objects.
 * @param toolGroupId - The unique identifier of the tool group.
 * @returns An array of segmentation representation objects.
 */
function getSegmentationRepresentations(
  toolGroupId: string
): ToolGroupSpecificRepresentations | [] {
  const segmentationStateManager = getDefaultSegmentationStateManager();
  return segmentationStateManager.getSegmentationRepresentations(toolGroupId);
}

/**
 * Get all segmentation representations in the state
 * @returns An array of segmentation representation objects.
 */
function getAllSegmentationRepresentations(): Record<
  string,
  ToolGroupSpecificRepresentation[]
> {
  const segmentationStateManager = getDefaultSegmentationStateManager();
  return segmentationStateManager.getAllSegmentationRepresentations();
}

/**
 * Get the tool group IDs that have a segmentation representation with the given
 * segmentationId
 * @param segmentationId - The id of the segmentation
 * @returns An array of tool group IDs.
 */
function getToolGroupIdsWithSegmentation(segmentationId: string): string[] {
  if (!segmentationId) {
    throw new Error('getToolGroupIdsWithSegmentation: segmentationId is empty');
  }

  const segmentationStateManager = getDefaultSegmentationStateManager();
  const state = segmentationStateManager.getState();
  const toolGroupIds = Object.keys(state.toolGroups);

  const foundToolGroupIds = [];
  toolGroupIds.forEach((toolGroupId) => {
    const toolGroupSegmentationRepresentations =
      segmentationStateManager.getSegmentationRepresentations(toolGroupId);

    toolGroupSegmentationRepresentations.forEach((representation) => {
      if (representation.segmentationId === segmentationId) {
        foundToolGroupIds.push(toolGroupId);
      }
    });
  });

  return foundToolGroupIds;
}

/**
 * Get the segmentation representations config for a given tool group
 * @param toolGroupId - The Id of the tool group that the segmentation
 * config belongs to.
 * @returns A SegmentationConfig object.
 */
function getToolGroupSpecificConfig(
  toolGroupId: string
): SegmentationRepresentationConfig {
  const segmentationStateManager = getDefaultSegmentationStateManager();
  return segmentationStateManager.getToolGroupSpecificConfig(toolGroupId);
}

/**
 * It returns the segmentation representation specific config which is the same for all the segments
 * @param segmentationRepresentationUID - The unique identifier of the segmentation representation.
 * @returns - The segmentation representation specific config.
 */
function getSegmentationRepresentationSpecificConfig(
  toolGroupId: string,
  segmentationRepresentationUID: string
): RepresentationConfig {
  const segmentationStateManager = getDefaultSegmentationStateManager();
  return segmentationStateManager.getSegmentationRepresentationSpecificConfig(
    toolGroupId,
    segmentationRepresentationUID
  );
}

function getSegmentSpecificRepresentationConfig(
  toolGroupId: string,
  segmentationRepresentationUID: string,
  segmentIndex: number
): RepresentationConfig {
  const segmentationStateManager = getDefaultSegmentationStateManager();
  return segmentationStateManager.getSegmentSpecificConfig(
    toolGroupId,
    segmentationRepresentationUID,
    segmentIndex
  );
}

/**
 * It returns the global segmentation config. Note that the toolGroup-specific
 * configuration has higher priority than the global configuration and overwrites
 * the global configuration for each representation.
 * @returns The global segmentation configuration for all segmentations.
 */
function getGlobalConfig(): SegmentationRepresentationConfig {
  const segmentationStateManager = getDefaultSegmentationStateManager();
  return segmentationStateManager.getGlobalConfig();
}

/**
 * Get the segmentation data object for a given tool group and
 * segmentation data UID. It searches all the toolGroup specific segmentation
 * data objects and returns the first one that matches the UID.
 * @param toolGroupId - The Id of the tool group that the segmentation
 * data belongs to.
 * @param segmentationRepresentationUID - The uid of the segmentation representation
 * @returns Segmentation Data object.
 */
function getSegmentationRepresentationByUID(
  toolGroupId: string,
  segmentationRepresentationUID: string
): ToolGroupSpecificRepresentation | undefined {
  const segmentationStateManager = getDefaultSegmentationStateManager();
  return segmentationStateManager.getSegmentationRepresentationByUID(
    toolGroupId,
    segmentationRepresentationUID
  );
}

/**
 * Get the color lut for a given index
 * @param index - The index of the color lut to retrieve.
 * @returns A ColorLUT array.
 */
function getColorLUT(index: number): ColorLUT | undefined {
  const segmentationStateManager = getDefaultSegmentationStateManager();
  return segmentationStateManager.getColorLUT(index);
}

export {
  getSegmentation,
  getSegmentations,
  getSegmentationRepresentations,
  getToolGroupIdsWithSegmentation,
  getToolGroupSpecificConfig,
  getSegmentationRepresentationSpecificConfig,
  getSegmentSpecificRepresentationConfig,
  getGlobalConfig,
  getSegmentationRepresentationByUID,
  getColorLUT,
  getAllSegmentationRepresentations,
  getDefaultSegmentationStateManager,
};
