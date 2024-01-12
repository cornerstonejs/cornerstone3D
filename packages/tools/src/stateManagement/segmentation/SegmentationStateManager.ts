import cloneDeep from 'lodash.clonedeep';
import type { Types } from '@cornerstonejs/core';
import { utilities as csUtils } from '@cornerstonejs/core';

import { SegmentationRepresentations } from '../../enums';
import getDefaultContourConfig from '../../tools/displayTools/Contour/contourConfig';
import getDefaultLabelmapConfig from '../../tools/displayTools/Labelmap/labelmapConfig';
import getDefaultSurfaceConfig from '../../tools/displayTools/Surface/surfaceConfig';
import type {
  RepresentationConfig,
  Segmentation,
  SegmentationRepresentationConfig,
  SegmentationState,
  SegmentSpecificRepresentationConfig,
  ToolGroupSpecificRepresentation,
  ToolGroupSpecificRepresentations,
} from '../../types/SegmentationStateTypes';

// Initialize the default configuration
// Note: when we get other representations, we should set their default representations too.
const defaultLabelmapConfig = getDefaultLabelmapConfig();
const defaultContourConfig = getDefaultContourConfig();
const defaultSurfaceConfig = getDefaultSurfaceConfig();

const newGlobalConfig: SegmentationRepresentationConfig = {
  renderInactiveSegmentations: true,
  representations: {
    [SegmentationRepresentations.Labelmap]: defaultLabelmapConfig,
    [SegmentationRepresentations.Contour]: defaultContourConfig,
    [SegmentationRepresentations.Surface]: defaultSurfaceConfig,
  },
};

/* A default initial state for the segmentation manager. */
const initialDefaultState: SegmentationState = {
  colorLUT: [],
  segmentations: [],
  globalConfig: newGlobalConfig,
  toolGroups: {},
};

/**
 * The SegmentationStateManager Class is responsible for managing the state of the
 * segmentations. It stores the segmentations and toolGroup specific representations
 * of the segmentation. It also stores a global config and a toolGroup specific
 * config. Note that this is a singleton state manager.
 */
export default class SegmentationStateManager {
  private state: SegmentationState;
  public readonly uid: string;

  constructor(uid?: string) {
    if (!uid) {
      uid = csUtils.uuidv4();
    }
    this.state = cloneDeep(initialDefaultState);
    this.uid = uid;
  }

  /**
   * It returns a copy of the current state of the segmentation
   * @returns A deep copy of the state.
   */
  getState(): SegmentationState {
    return this.state;
  }

  /**
   * It returns an array of toolGroupIds currently in the segmentation state.
   * @returns An array of strings.
   */
  getToolGroups(): string[] {
    return Object.keys(this.state.toolGroups);
  }

  /**
   * It returns the colorLUT at the specified index.
   * @param lutIndex - The index of the color LUT to retrieve.
   * @returns A ColorLUT object.
   */
  getColorLUT(lutIndex: number): Types.ColorLUT | undefined {
    return this.state.colorLUT[lutIndex];
  }

  getNextColorLUTIndex(): number {
    return this.state.colorLUT.length;
  }

  /**
   * Reset the state to the default state
   */
  resetState(): void {
    this.state = cloneDeep(initialDefaultState);
  }

  /**
   * Given a segmentation Id, return the segmentation state
   * @param segmentationId - The id of the segmentation to get the data for.
   * @returns - The segmentation data
   */
  getSegmentation(segmentationId: string): Segmentation | undefined {
    return this.state.segmentations.find(
      (segmentation) => segmentation.segmentationId === segmentationId
    );
  }

  /**
   * It adds a segmentation to the segmentations array.
   * @param segmentation - Segmentation
   */
  addSegmentation(segmentation: Segmentation): void {
    // Check if the segmentation already exists with the segmentationId
    if (this.getSegmentation(segmentation.segmentationId)) {
      throw new Error(
        `Segmentation with id ${segmentation.segmentationId} already exists`
      );
    }

    this.state.segmentations.push(segmentation);
  }

  /**
   * Get the segmentation representations for a tool group
   * @param toolGroupId - string
   * @returns A list of segmentation representations.
   */
  getSegmentationRepresentations(
    toolGroupId: string
  ): ToolGroupSpecificRepresentations | undefined {
    const toolGroupSegRepresentationsWithConfig =
      this.state.toolGroups[toolGroupId];

    if (!toolGroupSegRepresentationsWithConfig) {
      return;
    }

    return toolGroupSegRepresentationsWithConfig.segmentationRepresentations;
  }

  /**
   * Returns an array of all segmentation representations for all tool groups.
   * @returns An array of ToolGroupSpecificRepresentations.
   */
  getAllSegmentationRepresentations(): Record<
    string,
    ToolGroupSpecificRepresentation[]
  > {
    const toolGroupSegReps: Record<string, ToolGroupSpecificRepresentation[]> =
      {};
    Object.entries(this.state.toolGroups).forEach(
      ([toolGroupId, toolGroupSegRepresentationsWithConfig]) => {
        toolGroupSegReps[toolGroupId] =
          toolGroupSegRepresentationsWithConfig.segmentationRepresentations;
      }
    );
    return toolGroupSegReps;
  }

  /**
   * Add a new segmentation representation to the toolGroup's segmentation representations.
   * @param toolGroupId - The Id of the tool group .
   * @param segmentationRepresentation - The segmentation representation to add.
   */
  addSegmentationRepresentation(
    toolGroupId: string,
    segmentationRepresentation: ToolGroupSpecificRepresentation
  ): void {
    // Initialize the default toolGroup state if not created yet
    if (!this.state.toolGroups[toolGroupId]) {
      this.state.toolGroups[toolGroupId] = {
        segmentationRepresentations: [],
        config: {} as SegmentationRepresentationConfig,
      };
    }

    // local toolGroupSpecificSegmentationState
    this.state.toolGroups[toolGroupId].segmentationRepresentations.push(
      segmentationRepresentation
    );

    this._handleActiveSegmentation(toolGroupId, segmentationRepresentation);
  }

  /**
   * Get the global config containing both representation config
   * and render inactive segmentations config
   * @returns The global config object.
   */
  getGlobalConfig(): SegmentationRepresentationConfig {
    return this.state.globalConfig;
  }

  /**
   * It sets the global segmentation config including both representation config
   * and render inactive segmentations config
   * @param config - The global configuration for the segmentations.
   */
  setGlobalConfig(config: SegmentationRepresentationConfig): void {
    this.state.globalConfig = config;
  }

  /**
   * Given a toolGroupId and a segmentationRepresentationUID, return the segmentation
   * representation for that tool group.
   * @param toolGroupId - The Id of the tool group
   * @param segmentationRepresentationUID - string
   * @returns The segmentation representation.
   */
  getSegmentationRepresentationByUID(
    toolGroupId: string,
    segmentationRepresentationUID: string
  ): ToolGroupSpecificRepresentation | undefined {
    const toolGroupSegRepresentations =
      this.getSegmentationRepresentations(toolGroupId);

    const segmentationData = toolGroupSegRepresentations?.find(
      (representation) =>
        representation.segmentationRepresentationUID ===
        segmentationRepresentationUID
    );

    return segmentationData;
  }

  /**
   * It removes the segmentation from the segmentation state.
   * @param segmentationId - The id of the segmentation to remove.
   */
  removeSegmentation(segmentationId: string): void {
    this.state.segmentations = this.state.segmentations.filter(
      (segmentation) => segmentation.segmentationId !== segmentationId
    );
  }

  /**
   * Remove a segmentation representation from the toolGroup
   * @param toolGroupId - The Id of the tool group
   * @param segmentationRepresentationUID - the uid of the segmentation representation to remove
   * @param immediate - If true, the viewport will be updated immediately.
   */
  removeSegmentationRepresentation(
    toolGroupId: string,
    segmentationRepresentationUID: string
  ): void {
    const toolGroupSegmentationRepresentations =
      this.getSegmentationRepresentations(toolGroupId);

    if (
      !toolGroupSegmentationRepresentations ||
      !toolGroupSegmentationRepresentations.length
    ) {
      throw new Error(
        `No viewport specific segmentation state found for viewport ${toolGroupId}`
      );
    }

    const state =
      toolGroupSegmentationRepresentations as ToolGroupSpecificRepresentations;
    const index = state.findIndex(
      (segData) =>
        segData.segmentationRepresentationUID === segmentationRepresentationUID
    );

    if (index === -1) {
      console.warn(
        `No viewport specific segmentation state data found for viewport ${toolGroupId} and segmentation data UID ${segmentationRepresentationUID}`
      );
    }

    const removedSegmentationRepresentation =
      toolGroupSegmentationRepresentations[index];

    toolGroupSegmentationRepresentations.splice(index, 1);

    this._handleActiveSegmentation(
      toolGroupId,
      removedSegmentationRepresentation
    );
  }

  /**
   * Set the active segmentation data for a tool group
   * @param toolGroupId - The Id of the tool group that owns the
   * segmentation data.
   * @param segmentationRepresentationUID - string
   */
  setActiveSegmentationRepresentation(
    toolGroupId: string,
    segmentationRepresentationUID: string
  ): void {
    const toolGroupSegmentations =
      this.getSegmentationRepresentations(toolGroupId);

    if (!toolGroupSegmentations || !toolGroupSegmentations.length) {
      throw new Error(
        `No segmentation data found for toolGroupId: ${toolGroupId}`
      );
    }

    const segmentationData = toolGroupSegmentations.find(
      (segmentationData) =>
        segmentationData.segmentationRepresentationUID ===
        segmentationRepresentationUID
    );

    if (!segmentationData) {
      throw new Error(
        `No segmentation data found for segmentation data UID ${segmentationRepresentationUID}`
      );
    }

    segmentationData.active = true;
    this._handleActiveSegmentation(toolGroupId, segmentationData);
  }

  /**
   * Given a tool group Id it returns the tool group specific representation config
   *
   * @param toolGroupId - The Id of the tool group
   * @returns A SegmentationConfig object.
   */
  getToolGroupSpecificConfig(
    toolGroupId: string
  ): SegmentationRepresentationConfig | undefined {
    const toolGroupStateWithConfig = this.state.toolGroups[toolGroupId];

    if (!toolGroupStateWithConfig) {
      return;
    }

    return toolGroupStateWithConfig.config;
  }

  getSegmentationRepresentationSpecificConfig(
    toolGroupId: string,
    segmentationRepresentationUID: string
  ): RepresentationConfig {
    const segmentationRepresentation = this.getSegmentationRepresentationByUID(
      toolGroupId,
      segmentationRepresentationUID
    );

    if (!segmentationRepresentation) {
      return;
    }

    return segmentationRepresentation.segmentationRepresentationSpecificConfig;
  }

  setSegmentationRepresentationSpecificConfig(
    toolGroupId: string,
    segmentationRepresentationUID: string,
    config: RepresentationConfig
  ): void {
    const segmentationRepresentation = this.getSegmentationRepresentationByUID(
      toolGroupId,
      segmentationRepresentationUID
    );

    if (!segmentationRepresentation) {
      return;
    }

    segmentationRepresentation.segmentationRepresentationSpecificConfig =
      config;
  }

  getSegmentSpecificConfig(
    toolGroupId: string,
    segmentationRepresentationUID: string,
    segmentIndex: number
  ): RepresentationConfig {
    const segmentationRepresentation = this.getSegmentationRepresentationByUID(
      toolGroupId,
      segmentationRepresentationUID
    );

    if (!segmentationRepresentation) {
      return;
    }

    return segmentationRepresentation.segmentSpecificConfig[segmentIndex];
  }

  setSegmentSpecificConfig(
    toolGroupId: string,
    segmentationRepresentationUID: string,
    config: SegmentSpecificRepresentationConfig,
    options?: {
      clear: false;
    }
  ): void {
    const segmentationRepresentation = this.getSegmentationRepresentationByUID(
      toolGroupId,
      segmentationRepresentationUID
    );

    if (!segmentationRepresentation) {
      return;
    }

    if (!segmentationRepresentation.segmentSpecificConfig || options?.clear) {
      segmentationRepresentation.segmentSpecificConfig = {};
    }

    Object.keys(config).forEach((key) => {
      segmentationRepresentation.segmentSpecificConfig[key] = config[key];
    });
  }

  /**
   * Set the segmentation representations config for a given tool group. It will create a new
   * tool group specific config if one does not exist.
   *
   * @param toolGroupId - The Id of the tool group that the segmentation
   * belongs to.
   * @param config - SegmentationConfig
   */
  setSegmentationRepresentationConfig(
    toolGroupId: string,
    config: SegmentationRepresentationConfig
  ): void {
    let toolGroupStateWithConfig = this.state.toolGroups[toolGroupId];

    if (!toolGroupStateWithConfig) {
      this.state.toolGroups[toolGroupId] = {
        segmentationRepresentations: [],
        config: {
          renderInactiveSegmentations: true,
          representations: {},
        },
      };

      toolGroupStateWithConfig = this.state.toolGroups[toolGroupId];
    }

    toolGroupStateWithConfig.config = {
      ...toolGroupStateWithConfig.config,
      ...config,
    };
  }

  /**
   * It adds a color LUT to the state.
   * @param colorLUT - ColorLUT
   * @param lutIndex - The index of the color LUT table to add.
   */
  addColorLUT(colorLUT: Types.ColorLUT, lutIndex: number): void {
    if (this.state.colorLUT[lutIndex]) {
      console.warn('Color LUT table already exists, overwriting');
    }

    this.state.colorLUT[lutIndex] = structuredClone(colorLUT);
  }

  /**
   * Removes a color LUT to the state.
   * @param colorLUTIndex - The index of the color LUT table to remove.
   */
  removeColorLUT(colorLUTIndex: number): void {
    delete this.state.colorLUT[colorLUTIndex];
  }

  /**
   * It handles the active segmentation representation based on the active status of the
   * segmentation representation that was added or removed.
   *
   * @param toolGroupId - The Id of the tool group that the segmentation representation belongs to.
   * @param recentlyAddedOrRemovedSegmentationRepresentation - ToolGroupSpecificSegmentationData
   */
  _handleActiveSegmentation(
    toolGroupId: string,
    recentlyAddedOrRemovedSegmentationRepresentation: ToolGroupSpecificRepresentation
  ): void {
    const segmentationRepresentations =
      this.getSegmentationRepresentations(toolGroupId);

    // 1. If there is no segmentation representations, return early
    if (segmentationRepresentations.length === 0) {
      return;
    }

    // 2. If there is only one segmentation representation, make that one active
    if (segmentationRepresentations.length === 1) {
      segmentationRepresentations[0].active = true;
      return;
    }

    // 3. If removed Segmentation representation was active, make the first one active
    const activeSegmentationRepresentations =
      segmentationRepresentations.filter(
        (representation) => representation.active
      );

    if (activeSegmentationRepresentations.length === 0) {
      segmentationRepresentations[0].active = true;
      return;
    }

    // 4. If the added segmentation representation is active, make other segmentation
    // representations inactive
    if (recentlyAddedOrRemovedSegmentationRepresentation.active) {
      segmentationRepresentations.forEach((representation) => {
        if (
          representation.segmentationRepresentationUID !==
          recentlyAddedOrRemovedSegmentationRepresentation.segmentationRepresentationUID
        ) {
          representation.active = false;
        }
      });
    }

    // 5. if added/removed segmentation is is inactive, do nothing
  }
}

const defaultSegmentationStateManager = new SegmentationStateManager('DEFAULT');
export { defaultSegmentationStateManager };
