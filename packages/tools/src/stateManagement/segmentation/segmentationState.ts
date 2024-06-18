import type { Types } from '@cornerstonejs/core';
import type {
  RepresentationConfig,
  Segmentation,
  SegmentationPublicInput,
  SegmentationRepresentationConfig,
  SegmentSpecificRepresentationConfig,
  SegmentationRepresentation,
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
 * @returns A Segmentation object
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
 * Get all segmentation representations in the state
 * @returns An array of segmentation representation objects.
 */
function getAllSegmentationRepresentations(): SegmentationRepresentation[] {
  const segmentationStateManager = getDefaultSegmentationStateManager();
  const state = segmentationStateManager.getState();
  return Object.values(state.representations);
}

/**
 * Finds all segmentation representations with the given segmentationId.
 * @param segmentationId - The ID of the segmentation.
 * @returns An array of found segmentation representations.
 */
function getSegmentationRepresentations(
  segmentationId: string
): SegmentationRepresentation[] {
  const allRepresentations = getAllSegmentationRepresentations();
  return allRepresentations.filter(
    (representation) => representation.segmentationId === segmentationId
  );
}

/**
 * Finds a segmentation representation by its UID.
 *
 * @param segmentationRepresentationUID - The UID of the segmentation representation to find.
 * @returns The found segmentation representation, or undefined if not found.
 */
function getSegmentationRepresentationByUID(
  segmentationRepresentationUID: string
): SegmentationRepresentation | undefined {
  const segmentationStateManager = getDefaultSegmentationStateManager();
  return segmentationStateManager.getSegmentationRepresentation(
    segmentationRepresentationUID
  );
}

/**
 * Get the segmentation representations config for a given representation
 * @param segmentationRepresentationUID - The UID of the segmentation representation.
 * @returns A RepresentationConfig object.
 */
function getSegmentationRepresentationConfig(
  segmentationRepresentationUID: string
): RepresentationConfig {
  const segmentationStateManager = getDefaultSegmentationStateManager();
  return segmentationStateManager.getRepresentationConfig(
    segmentationRepresentationUID
  );
}

/**
 * Set the segmentation representation config for the provided representation.
 * It fires SEGMENTATION_REPRESENTATION_MODIFIED event if not suppressed.
 *
 * @triggers SEGMENTATION_REPRESENTATION_MODIFIED
 * @param segmentationRepresentationUID - The UID of the segmentation representation.
 * @param config - The new configuration for the representation.
 * @param suppressEvents - If true, the event will not be triggered.
 */
function setSegmentationRepresentationConfig(
  segmentationRepresentationUID: string,
  config: RepresentationConfig,
  suppressEvents?: boolean
): void {
  const segmentationStateManager = getDefaultSegmentationStateManager();
  segmentationStateManager.setRepresentationConfig(
    segmentationRepresentationUID,
    config
  );

  if (!suppressEvents) {
    triggerSegmentationRepresentationModified(segmentationRepresentationUID);
  }
}

function getSegmentSpecificConfig(
  segmentationRepresentationUID: string,
  segmentIndex: number
): RepresentationConfig {
  const segmentationStateManager = getDefaultSegmentationStateManager();
  return segmentationStateManager.getSegmentSpecificConfig(
    segmentationRepresentationUID,
    segmentIndex
  );
}

function setSegmentSpecificConfig(
  segmentationRepresentationUID: string,
  segmentIndex: number,
  config: SegmentSpecificRepresentationConfig,
  suppressEvents = false
): void {
  const segmentationStateManager = getDefaultSegmentationStateManager();
  segmentationStateManager.setSegmentSpecificConfig(
    segmentationRepresentationUID,
    segmentIndex,
    config
  );

  if (!suppressEvents) {
    triggerSegmentationRepresentationModified(segmentationRepresentationUID);
  }
}

function getViewportSegmentationRepresentations(
  viewportId: string
): SegmentationRepresentation[] {
  const segmentationStateManager = getDefaultSegmentationStateManager();

  return segmentationStateManager.getViewportSegmentationRepresentations(
    viewportId
  );
}

function addSegmentationRepresentationToViewport(
  viewportId: string,
  segmentationRepresentation: SegmentationRepresentation
): void {
  const segmentationStateManager = getDefaultSegmentationStateManager();

  // check if the segmentation representation is already in the state
  segmentationStateManager.addSegmentationRepresentation(
    segmentationRepresentation
  );

  segmentationStateManager.addSegmentationRepresentationToViewport(
    viewportId,
    segmentationRepresentation.segmentationRepresentationUID
  );
}

/**
 * It returns the global segmentation config.
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
 * Remove a segmentation representation from the segmentation state manager.
 * It fires SEGMENTATION_REPRESENTATION_REMOVED event.
 *
 * @triggers SEGMENTATION_REPRESENTATION_REMOVED
 *
 * @param segmentationRepresentationUID - The uid of the segmentation representation to remove.
 */
function removeSegmentationRepresentation(
  segmentationRepresentationUID: string
): void {
  const segmentationStateManager = getDefaultSegmentationStateManager();
  segmentationStateManager.removeSegmentationRepresentation(
    segmentationRepresentationUID
  );

  triggerSegmentationRepresentationRemoved(segmentationRepresentationUID);
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

/**
 * Returns the visibility of a segmentation representation in a specific viewport.
 * @param viewportId - The ID of the viewport.
 * @param segmentationRepresentationUID - The UID of the segmentation representation.
 * @returns The visibility of the segmentation representation in the viewport.
 */
function getSegmentationRepresentationVisibility(
  viewportId: string,
  segmentationRepresentationUID: string
): boolean {
  const segmentationStateManager = getDefaultSegmentationStateManager();
  return segmentationStateManager.getViewportVisibility(
    viewportId,
    segmentationRepresentationUID
  );
}

/**
 * Sets the visibility of a segmentation representation in a specific viewport.
 * @param viewportId - The ID of the viewport.
 * @param segmentationRepresentationUID - The UID of the segmentation representation.
 * @param visible - The visibility to set for the segmentation representation in the viewport.
 */
function setSegmentationRepresentationVisibility(
  viewportId: string,
  segmentationRepresentationUID: string,
  visible: boolean
): void {
  const segmentationStateManager = getDefaultSegmentationStateManager();
  segmentationStateManager.setViewportVisibility(
    viewportId,
    segmentationRepresentationUID,
    visible
  );
}

export {
  getDefaultSegmentationStateManager,
  // Segmentation
  getSegmentation,
  getSegmentations,
  addSegmentation,
  removeSegmentation,
  // Segmentation Representation
  getAllSegmentationRepresentations,
  getSegmentationRepresentations,
  getSegmentationRepresentationByUID,
  removeSegmentationRepresentation,
  // config
  getGlobalConfig,
  setGlobalConfig,
  getSegmentationRepresentationConfig,
  setSegmentationRepresentationConfig,
  getSegmentSpecificConfig,
  setSegmentSpecificConfig,
  // viewport
  getViewportSegmentationRepresentations,
  addSegmentationRepresentationToViewport,
  // color
  addColorLUT,
  getColorLUT,
  getNextColorLUTIndex,
  removeColorLUT,
  // visibility
  getSegmentationRepresentationVisibility,
  setSegmentationRepresentationVisibility,
};
