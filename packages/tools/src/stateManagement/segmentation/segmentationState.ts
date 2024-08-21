import type { Types } from '@cornerstonejs/core';
import type {
  RepresentationConfig,
  Segmentation,
  SegmentationPublicInput,
  SegmentationRepresentationConfig,
  SegmentRepresentationConfig,
  SegmentationRepresentation,
} from '../../types/SegmentationStateTypes';
import { defaultSegmentationStateManager } from './SegmentationStateManager';
import {
  triggerSegmentationModified,
  triggerSegmentationRemoved,
  triggerSegmentationRepresentationModified,
  triggerSegmentationRepresentationRemoved,
} from './triggerSegmentationEvents';

import { getSegmentation } from './getSegmentation';

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
 * Finds a segmentation representation by its UID.
 *
 * @param segmentationRepresentationUID - The UID of the segmentation representation to find.
 * @returns The found segmentation representation, or undefined if not found.
 */
function getSegmentationRepresentation(
  segmentationRepresentationUID: string
): SegmentationRepresentation | undefined {
  const segmentationStateManager = getDefaultSegmentationStateManager();
  return segmentationStateManager.getSegmentationRepresentation(
    segmentationRepresentationUID
  );
}

/**
 * Retrieves the configuration for all segments associated with the given segmentation representation UID.
 *
 * @param segmentationRepresentationUID - The UID of the segmentation representation.
 * @returns The configuration for all segments.
 */
function getSegmentationRepresentationConfig(
  segmentationRepresentationUID: string
): RepresentationConfig {
  const segmentationStateManager = getDefaultSegmentationStateManager();

  return segmentationStateManager.getSegmentationRepresentationConfig(
    segmentationRepresentationUID
  );
}

/**
 * Sets the configuration for all segments in a segmentation representation.
 *
 * @param segmentationRepresentationUID - The UID of the segmentation representation.
 * @param config - The configuration to be set for all segments.
 * @param suppressEvents - Optional. If true, events will not be triggered. Defaults to false.
 */
function setSegmentationRepresentationConfig(
  segmentationRepresentationUID: string,
  config: RepresentationConfig,
  suppressEvents?: boolean
): void {
  const segmentationStateManager = getDefaultSegmentationStateManager();
  segmentationStateManager.setSegmentationRepresentationConfig(
    segmentationRepresentationUID,
    config
  );

  if (!suppressEvents) {
    triggerSegmentationRepresentationModified(segmentationRepresentationUID);
  }
}

/**
 * Retrieves the per-segment configuration for a given segmentation representation.
 *
 * @param segmentationRepresentationUID - The unique identifier of the segmentation representation.
 * @returns The per-segment configuration for the specified segmentation representation.
 */
function getPerSegmentConfig(
  segmentationRepresentationUID: string
): SegmentRepresentationConfig {
  const segmentationStateManager = getDefaultSegmentationStateManager();
  return segmentationStateManager.getPerSegmentConfig(
    segmentationRepresentationUID
  );
}

/**
 * Sets the per-segment configuration for a given segmentation representation.
 *
 * @param segmentationRepresentationUID - The unique identifier of the segmentation representation.
 * @param config - The per-segment configuration to set.
 * @param suppressEvents - Optional. If true, events will not be triggered. Defaults to false.
 */
function setPerSegmentConfig(
  segmentationRepresentationUID: string,
  config: SegmentRepresentationConfig,
  suppressEvents?: boolean
): void {
  const segmentationStateManager = getDefaultSegmentationStateManager();
  segmentationStateManager.setPerSegmentConfig(
    segmentationRepresentationUID,
    config
  );

  if (!suppressEvents) {
    triggerSegmentationRepresentationModified(segmentationRepresentationUID);
  }
}

/**
 * Retrieves the viewport IDs that have a specific segmentation.
 * @param segmentationId - The ID of the segmentation.
 * @returns An array of viewport IDs that have the specified segmentation.
 */
function getViewportIdsWithSegmentation(segmentationId: string): string[] {
  const segmentationStateManager = getDefaultSegmentationStateManager();
  const state = segmentationStateManager.getState();
  const viewports = state.viewports;

  return Object.keys(viewports).filter((viewportId) => {
    const viewport = viewports[viewportId];
    return Object.keys(viewport).some(
      (segRepUID) =>
        state.representations[segRepUID].segmentationId === segmentationId
    );
  });
}

/**
 * Retrieves the segmentation representations for a given viewport.
 * @param viewportId - The ID of the viewport.
 * @returns An array of SegmentationRepresentation objects or an empty array if the viewport is not found.
 */
function getSegmentationRepresentations(
  viewportId: string
): SegmentationRepresentation[] | [] {
  const viewportRenderingState =
    getSegmentationRepresentationViewportStates(viewportId);

  if (!viewportRenderingState) {
    return [];
  }

  const segRepUIDs = Object.keys(viewportRenderingState);

  return segRepUIDs
    .map((segRepUID) => getSegmentationRepresentation(segRepUID))
    .filter(Boolean);
}

/**
 * Retrieves the rendering state of representations for a specific viewport.
 * @param viewportId - The ID of the viewport.
 * @returns An object containing the rendering state of representations for the specified viewport.
 */
function getSegmentationRepresentationViewportStates(viewportId: string): {
  [segRepUID: string]: {
    visible: boolean;
    segmentsHidden: Set<number>;
    active: boolean;
  };
} {
  const segmentationStateManager = getDefaultSegmentationStateManager();
  const state = segmentationStateManager.getState();
  return state.viewports?.[viewportId] || {};
}

/**
 * Adds a segmentation representation to a specific viewport.
 *
 * @param viewportId - The ID of the viewport to add the representation to.
 * @param segmentationRepresentation - The segmentation representation to add.
 * @param suppressEvents - (Optional) A flag indicating whether to suppress triggering events. Defaults to false.
 */
function addSegmentationRepresentation(
  viewportId: string,
  segmentationRepresentation: SegmentationRepresentation,
  suppressEvents?: boolean
): void {
  const segmentationStateManager = getDefaultSegmentationStateManager();

  // check if the segmentation representation is already in the state
  segmentationStateManager.addSegmentationRepresentationState(
    segmentationRepresentation
  );

  segmentationStateManager.addSegmentationRepresentationToViewport(
    viewportId,
    segmentationRepresentation.segmentationRepresentationUID
  );

  if (!suppressEvents) {
    triggerSegmentationRepresentationModified(
      segmentationRepresentation.segmentationRepresentationUID
    );
  }
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
function removeRepresentation(
  segmentationRepresentationUID: string,
  suppressEvents?: boolean
): void {
  const segmentationStateManager = getDefaultSegmentationStateManager();
  segmentationStateManager.removeRepresentation(segmentationRepresentationUID);

  if (!suppressEvents) {
    triggerSegmentationRepresentationRemoved(segmentationRepresentationUID);
  }
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
  return segmentationStateManager.getSegmentationRepresentationVisibility(
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
  segmentationStateManager.setSegmentationRepresentationVisibility(
    viewportId,
    segmentationRepresentationUID,
    visible
  );
}

/**
 * Retrieves the active segmentation representation for a given viewport.
 *
 * @param viewportId - The ID of the viewport.
 * @returns The active segmentation representation, or undefined if not found.
 */
function getActiveSegmentationRepresentation(
  viewportId: string
): SegmentationRepresentation | undefined {
  const segmentationStateManager = getDefaultSegmentationStateManager();
  return segmentationStateManager.getActiveSegmentationRepresentation(
    viewportId
  );
}

/**
 * Sets the segmentation representation as active for the specified viewport.
 *
 * @param viewportId - The ID of the viewport.
 * @param segmentationRepresentationUID - The UID of the segmentation representation.
 * @returns
 */
function setActiveSegmentationRepresentation(
  viewportId: string,
  segmentationRepresentationUID: string,
  suppressEvents?: boolean
): void {
  const segmentationStateManager = getDefaultSegmentationStateManager();
  segmentationStateManager.setActiveSegmentationRepresentation(
    viewportId,
    segmentationRepresentationUID
  );

  if (!suppressEvents) {
    triggerSegmentationRepresentationModified(segmentationRepresentationUID);
  }
}

/**
 * Retrieves the labelmap image IDs for a specific viewport and segmentation representation.
 *
 * @param viewportId - The ID of the viewport.
 * @param segmentationId -  The ID of the segmentation.
 * @returns An array of labelmap image IDs.
 */
function getCurrentLabelmapImageIdForViewport(
  viewportId: string,
  segmentationId?: string
) {
  const segmentationStateManager = getDefaultSegmentationStateManager();
  return segmentationStateManager.getCurrentLabelmapImageIdForViewport(
    viewportId,
    segmentationId
  );
}

function updateLabelmapSegmentationImageReferences(
  viewportId: string,
  segmentationId: string
) {
  const segmentationStateManager = getDefaultSegmentationStateManager();
  segmentationStateManager.updateLabelmapSegmentationImageReferences(
    viewportId,
    segmentationId
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
  getSegmentationRepresentation,
  removeRepresentation,
  // config
  getGlobalConfig,
  setGlobalConfig,
  getSegmentationRepresentationConfig,
  setSegmentationRepresentationConfig,
  getPerSegmentConfig,
  setPerSegmentConfig,
  // viewport
  getSegmentationRepresentations,
  addSegmentationRepresentation,
  getSegmentationRepresentationViewportStates,
  // color
  addColorLUT,
  getColorLUT,
  getNextColorLUTIndex,
  removeColorLUT,
  // visibility
  getSegmentationRepresentationsForSegmentation,
  getSegmentationRepresentationVisibility,
  setSegmentationRepresentationVisibility,
  getViewportIdsWithSegmentation,
  // active
  getActiveSegmentationRepresentation,
  setActiveSegmentationRepresentation,
  getCurrentLabelmapImageIdForViewport,
  updateLabelmapSegmentationImageReferences,
};
