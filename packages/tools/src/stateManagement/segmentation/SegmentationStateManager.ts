import type { Types } from '@cornerstonejs/core';
import { utilities as csUtils } from '@cornerstonejs/core';

import { SegmentationRepresentations } from '../../enums';
import getDefaultContourConfig from '../../tools/displayTools/Contour/contourConfig';
import getDefaultLabelmapConfig from '../../tools/displayTools/Labelmap/labelmapConfig';
import getDefaultSurfaceConfig from '../../tools/displayTools/Surface/surfaceConfig';
import type {
  RepresentationConfig,
  Segmentation,
  SegmentationRepresentation,
  SegmentationRepresentationConfig,
  SegmentationState,
} from '../../types/SegmentationStateTypes';

// Initialize the default configuration
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

const initialDefaultState: SegmentationState = {
  colorLUT: [],
  segmentations: [],
  globalConfig: newGlobalConfig,
  representations: {},
  viewports: {},
};

/**
 * The SegmentationStateManager Class is responsible for managing the state of the
 * segmentations. It stores the segmentations, segmentation representations,
 * and viewport-specific visibility of the representations. It also stores a global
 * config for segmentation rendering. Note that this is a singleton state manager.
 */
export default class SegmentationStateManager {
  private state: SegmentationState;
  public readonly uid: string;

  constructor(uid?: string) {
    if (!uid) {
      uid = csUtils.uuidv4();
    }
    this.state = structuredClone(initialDefaultState);
    this.uid = uid;
  }

  /**
   * Returns a copy of the current state of the segmentation.
   * @returns A deep copy of the segmentation state.
   */
  getState(): SegmentationState {
    return this.state;
  }

  /**
   * Returns the colorLUT at the specified index.
   * @param lutIndex - The index of the color LUT to retrieve.
   * @returns A ColorLUT object.
   */
  getColorLUT(lutIndex: number): Types.ColorLUT | undefined {
    return this.state.colorLUT[lutIndex];
  }

  /**
   * Returns the next available color LUT index.
   * @returns The next color LUT index.
   */
  getNextColorLUTIndex(): number {
    return this.state.colorLUT.length;
  }

  /**
   * Resets the state to the default state.
   */
  resetState(): void {
    this.state = structuredClone(initialDefaultState);
  }

  /**
   * Returns the segmentation state for the given segmentation ID.
   * @param segmentationId - The ID of the segmentation.
   * @returns The segmentation state object.
   */
  getSegmentation(segmentationId: string): Segmentation | undefined {
    return this.state.segmentations.find(
      (segmentation) => segmentation.segmentationId === segmentationId
    );
  }

  /**
   * Adds a segmentation to the segmentations array.
   * @param segmentation - The segmentation object to add.
   */
  addSegmentation(segmentation: Segmentation): void {
    if (this.getSegmentation(segmentation.segmentationId)) {
      throw new Error(
        `Segmentation with id ${segmentation.segmentationId} already exists`
      );
    }

    this.state.segmentations.push(segmentation);
  }

  /**
   * Removes the segmentation from the segmentation state.
   * @param segmentationId - The ID of the segmentation to remove.
   */
  removeSegmentation(segmentationId: string): void {
    this.state.segmentations = this.state.segmentations.filter(
      (segmentation) => segmentation.segmentationId !== segmentationId
    );
  }

  /**
   * Returns the segmentation representation with the given UID.
   * @param segmentationRepresentationUID - The UID of the segmentation representation.
   * @returns The segmentation representation object.
   */
  getSegmentationRepresentation(
    segmentationRepresentationUID: string
  ): SegmentationRepresentation | undefined {
    return this.state.representations[segmentationRepresentationUID];
  }

  /**
   * Adds a segmentation representation to the representations object.
   * @param segmentationRepresentation - The segmentation representation object to add.
   */
  addSegmentationRepresentation(
    segmentationRepresentation: SegmentationRepresentation
  ): void {
    const { segmentationRepresentationUID } = segmentationRepresentation;
    this.state.representations[segmentationRepresentationUID] =
      segmentationRepresentation;
  }

  addSegmentationRepresentationToViewport(
    viewportId: string,
    segmentationRepresentationUID: string
  ): void {
    if (!this.state.viewports[viewportId]) {
      this.state.viewports[viewportId] = {};
    }

    this.state.viewports[viewportId][segmentationRepresentationUID] = {
      visible: true,
    };
  }

  getViewportSegmentationRepresentations(
    viewportId: string
  ): SegmentationRepresentation[] {
    const viewport = this.state.viewports[viewportId];

    if (!viewport) {
      return [];
    }

    return Object.keys(viewport).map((segRepUID) => {
      return this.getSegmentationRepresentation(segRepUID);
    });
  }

  /**
   * Removes a segmentation representation from the representations object.
   * @param segmentationRepresentationUID - The UID of the segmentation representation to remove.
   */
  removeSegmentationRepresentation(
    segmentationRepresentationUID: string
  ): void {
    delete this.state.representations[segmentationRepresentationUID];
  }

  /**
   * Returns the global segmentation representation config.
   * @returns The global segmentation representation config object.
   */
  getGlobalConfig(): SegmentationRepresentationConfig {
    return this.state.globalConfig;
  }

  /**
   * Sets the global segmentation representation config.
   * @param config - The global segmentation representation config object to set.
   */
  setGlobalConfig(config: SegmentationRepresentationConfig): void {
    this.state.globalConfig = config;
  }

  /**
   * Returns the default representation config for the given segmentation representation UID.
   * @param segmentationRepresentationUID - The UID of the segmentation representation.
   * @returns The default representation config object.
   */
  getRepresentationConfig(
    segmentationRepresentationUID: string
  ): RepresentationConfig {
    const segmentationRepresentation = this.getSegmentationRepresentation(
      segmentationRepresentationUID
    );

    if (!segmentationRepresentation) {
      return;
    }

    return segmentationRepresentation.config.default;
  }

  /**
   * Sets the default representation config for the given segmentation representation UID.
   * @param segmentationRepresentationUID - The UID of the segmentation representation.
   * @param config - The default representation config object to set.
   */
  setRepresentationConfig(
    segmentationRepresentationUID: string,
    config: RepresentationConfig
  ): void {
    const segmentationRepresentation = this.getSegmentationRepresentation(
      segmentationRepresentationUID
    );

    if (!segmentationRepresentation) {
      return;
    }

    segmentationRepresentation.config.default = config;
  }

  /**
   * Returns the segment-specific representation config for the given segmentation representation UID and segment index.
   * @param segmentationRepresentationUID - The UID of the segmentation representation.
   * @param segmentIndex - The index of the segment.
   * @returns The segment-specific representation config object.
   */
  getSegmentSpecificConfig(
    segmentationRepresentationUID: string,
    segmentIndex: number
  ): RepresentationConfig {
    const segmentationRepresentation = this.getSegmentationRepresentation(
      segmentationRepresentationUID
    );

    if (!segmentationRepresentation) {
      return;
    }

    const { overrides } = segmentationRepresentation.config;
    return overrides && overrides[segmentIndex];
  }

  /**
   * Sets the segment-specific representation config for the given segmentation representation UID and segment index.
   * @param segmentationRepresentationUID - The UID of the segmentation representation.
   * @param segmentIndex - The index of the segment.
   * @param config - The segment-specific representation config object to set.
   */
  setSegmentSpecificConfig(
    segmentationRepresentationUID: string,
    segmentIndex: number,
    config: RepresentationConfig
  ): void {
    const segmentationRepresentation = this.getSegmentationRepresentation(
      segmentationRepresentationUID
    );

    if (!segmentationRepresentation) {
      return;
    }

    if (!segmentationRepresentation.config.overrides) {
      segmentationRepresentation.config.overrides = {};
    }

    segmentationRepresentation.config.overrides[segmentIndex] = config;
  }

  /**
   * Returns the visibility of a segmentation representation in a specific viewport.
   * @param viewportId - The ID of the viewport.
   * @param segmentationRepresentationUID - The UID of the segmentation representation.
   * @returns The visibility of the segmentation representation in the viewport.
   */
  getViewportVisibility(
    viewportId: string,
    segmentationRepresentationUID: string
  ): boolean {
    const viewport = this.state.viewports[viewportId];
    return viewport && viewport[segmentationRepresentationUID]?.visible;
  }

  /**
   * Sets the visibility of a segmentation representation in a specific viewport.
   * @param viewportId - The ID of the viewport.
   * @param segmentationRepresentationUID - The UID of the segmentation representation.
   * @param visible - The visibility to set for the segmentation representation in the viewport.
   */
  setViewportVisibility(
    viewportId: string,
    segmentationRepresentationUID: string,
    visible: boolean
  ): void {
    if (!this.state.viewports[viewportId]) {
      this.state.viewports[viewportId] = {};
    }

    this.state.viewports[viewportId][segmentationRepresentationUID] = {
      visible,
    };
  }

  /**
   * Adds a color LUT to the state.
   * @param colorLUT - The color LUT object to add.
   * @param lutIndex - The index of the color LUT table to add.
   */
  addColorLUT(colorLUT: Types.ColorLUT, lutIndex: number): void {
    if (this.state.colorLUT[lutIndex]) {
      console.warn('Color LUT table already exists, overwriting');
    }

    this.state.colorLUT[lutIndex] = structuredClone(colorLUT);
  }

  /**
   * Removes a color LUT from the state.
   * @param colorLUTIndex - The index of the color LUT table to remove.
   */
  removeColorLUT(colorLUTIndex: number): void {
    delete this.state.colorLUT[colorLUTIndex];
  }
}

const defaultSegmentationStateManager = new SegmentationStateManager('DEFAULT');
window.segs = defaultSegmentationStateManager;
export { defaultSegmentationStateManager };
