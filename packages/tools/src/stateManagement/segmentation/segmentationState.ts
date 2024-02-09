import type { Types } from '@cornerstonejs/core';
import type {
  RepresentationConfig,
  Segmentation,
  SegmentationPublicInput,
  SegmentationRepresentationConfig,
  SegmentSpecificRepresentationConfig,
  ToolGroupSpecificRepresentation,
  ToolGroupSpecificRepresentations,
} from '../../types/SegmentationStateTypes';
import { defaultSegmentationStateManager } from './SegmentationStateManager';
import {
  triggerSegmentationModified,
  triggerSegmentationRemoved,
  triggerSegmentationRepresentationModified,
  triggerSegmentationRepresentationRemoved,
} from './triggerSegmentationEvents';

import normalizeSegmentationInput from './helpers/normalizeSegmentationInput';

/**
 * It returns the defaultSegmentationStateManager.
 */
function getDefaultSegmentationStateManager() {
  return defaultSegmentationStateManager;
}

/*************************
 *
 * Segmentation State
 *
 **************************/

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
 * Finds all segmentation representations with the given segmentationId.
 * @param segmentationId - The ID of the segmentation.
 * @returns An array of found segmentation representations.
 */
function getSegmentationIdRepresentations(segmentationId) {
  const allRepresentations = getAllSegmentationRepresentations() || {};
  const foundRepresentations = [];

  for (const toolGroupId in allRepresentations) {
    const toolGroupRepresentations = allRepresentations[toolGroupId];

    const foundRepresentation = toolGroupRepresentations.find(
      (representation) => representation.segmentationId === segmentationId
    );

    if (foundRepresentation) {
      foundRepresentations.push(foundRepresentation);
    }
  }

  return foundRepresentations;
}

/**
 * Finds a segmentation representation by its UID.
 *
 * @param segmentationRepresentationUID - The UID of the segmentation representation to find.
 * @returns The found segmentation representation, or undefined if not found.
 */
function findSegmentationRepresentationByUID(
  segmentationRepresentationUID: string
): {
  toolGroupId: string;
  segmentationRepresentation: ToolGroupSpecificRepresentation;
} {
  const allToolGroupRepresentations = getAllSegmentationRepresentations() || [];

  const toolGroupIds = Object.keys(allToolGroupRepresentations);

  for (const toolGroupId of toolGroupIds) {
    const toolGroupRepresentations =
      getAllSegmentationRepresentations()[toolGroupId];

    const foundRepresentation = toolGroupRepresentations.find(
      (representation) =>
        representation.segmentationRepresentationUID ===
        segmentationRepresentationUID
    );

    if (foundRepresentation) {
      return {
        segmentationRepresentation: foundRepresentation,
        toolGroupId,
      };
    }
  }
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
 * Set the segmentation representation config for the provided toolGroup. ToolGroup specific
 * configuration overwrites the global configuration for each representation.
 * It fires SEGMENTATION_REPRESENTATION_MODIFIED event if not suppressed.
 *
 * @triggers SEGMENTATION_REPRESENTATION_MODIFIED
 * @param toolGroupId - The Id of the tool group that the segmentation
 * config is being set for.
 * @param config - The new configuration for the tool group.
 * @param suppressEvents - If true, the event will not be triggered.
 */
function setToolGroupSpecificConfig(
  toolGroupId: string,
  config: SegmentationRepresentationConfig,
  suppressEvents?: boolean
): void {
  const segmentationStateManager = getDefaultSegmentationStateManager();
  segmentationStateManager.setSegmentationRepresentationConfig(
    toolGroupId,
    config
  );

  if (!suppressEvents) {
    triggerSegmentationRepresentationModified(toolGroupId);
  }
}

/**
 * It sets the segmentation representation specific config for all the segments
 * inside the segmentation.
 * @param segmentationRepresentationUID - The unique identifier of the segmentation representation.
 * @param config  - The new configuration for the segmentation representation it is an object with keys of
 * different representation types, and values of the configuration for each representation type.
 */
function setSegmentationRepresentationSpecificConfig(
  toolGroupId: string,
  segmentationRepresentationUID: string,
  config: RepresentationConfig,
  suppressEvents = false
): void {
  const segmentationStateManager = getDefaultSegmentationStateManager();
  segmentationStateManager.setSegmentationRepresentationSpecificConfig(
    toolGroupId,
    segmentationRepresentationUID,
    config
  );

  if (!suppressEvents) {
    triggerSegmentationRepresentationModified(
      toolGroupId,
      segmentationRepresentationUID
    );
  }
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

function setSegmentSpecificRepresentationConfig(
  toolGroupId: string,
  segmentationRepresentationUID: string,
  config: SegmentSpecificRepresentationConfig,
  suppressEvents = false
): void {
  const segmentationStateManager = getDefaultSegmentationStateManager();
  segmentationStateManager.setSegmentSpecificConfig(
    toolGroupId,
    segmentationRepresentationUID,
    config
  );

  // Todo: this can be even more performant if we create a new event for
  // triggering a specific segment config change.
  if (!suppressEvents) {
    triggerSegmentationRepresentationModified(
      toolGroupId,
      segmentationRepresentationUID
    );
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
 * Set the global segmentation configuration. It fires SEGMENTATION_MODIFIED
 * event if not suppressed.
 *
 * @triggers SEGMENTATION_MODIFIED
 * @param config - The new global segmentation config.
 * @param suppressEvents - If true, the `segmentationGlobalStateModified` event will not be triggered.
 */
function setGlobalConfig(
  config: SegmentationRepresentationConfig,
  suppressEvents?: boolean
): void {
  const segmentationStateManager = getDefaultSegmentationStateManager();
  segmentationStateManager.setGlobalConfig(config);

  if (!suppressEvents) {
    triggerSegmentationModified();
  }
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
 * Removes all segmentation representations associated with a tool group.
 * @param toolGroupId - The ID of the tool group.
 */
function removeSegmentationRepresentations(toolGroupId: string): void {
  const segmentationRepresentations =
    getSegmentationRepresentations(toolGroupId) || [];

  segmentationRepresentations.forEach((representation) => {
    removeSegmentationRepresentation(
      toolGroupId,
      representation.segmentationRepresentationUID
    );
  });
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

/**
 * Get the color lut for a given index
 * @param index - The index of the color lut to retrieve.
 * @returns A ColorLUT array.
 */
function getColorLUT(index: number): Types.ColorLUT | undefined {
  const segmentationStateManager = getDefaultSegmentationStateManager();
  return segmentationStateManager.getColorLUT(index);
}

function getNextColorLUTIndex(): number {
  const segmentationStateManager = getDefaultSegmentationStateManager();
  return segmentationStateManager.getNextColorLUTIndex();
}

/**
 * Add a color LUT to the segmentation state manager
 * @param colorLUT - The color LUT array to add.
 * @param index - The index of the color LUT to add.
 */
function addColorLUT(colorLUT: Types.ColorLUT, index: number): void {
  const segmentationStateManager = getDefaultSegmentationStateManager();
  segmentationStateManager.addColorLUT(colorLUT, index);
  // Todo: trigger event color LUT added
}

export {
  getDefaultSegmentationStateManager,
  // Segmentation
  getSegmentation,
  getSegmentations,
  addSegmentation,
  removeSegmentation,
  // ToolGroup specific Segmentation Representation
  getSegmentationRepresentations,
  addSegmentationRepresentation,
  removeSegmentationRepresentation,
  removeSegmentationRepresentations,
  // config
  getToolGroupSpecificConfig,
  setToolGroupSpecificConfig,
  getGlobalConfig,
  setGlobalConfig,
  getSegmentationRepresentationSpecificConfig,
  setSegmentationRepresentationSpecificConfig,
  getSegmentSpecificRepresentationConfig,
  setSegmentSpecificRepresentationConfig,
  // helpers s
  getToolGroupIdsWithSegmentation,
  getAllSegmentationRepresentations,
  getSegmentationRepresentationByUID,
  getSegmentationIdRepresentations,
  // color
  addColorLUT,
  getColorLUT,
  getNextColorLUTIndex,
  removeColorLUT,
  //
  findSegmentationRepresentationByUID,
};
