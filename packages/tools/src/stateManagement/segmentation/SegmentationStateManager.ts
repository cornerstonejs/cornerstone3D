import type { Types } from '@cornerstonejs/core';
import {
  BaseVolumeViewport,
  cache,
  utilities as csUtils,
  getEnabledElementByViewportId,
} from '@cornerstonejs/core';

import { SegmentationRepresentations } from '../../enums';
import getDefaultContourConfig from '../../tools/displayTools/Contour/contourConfig';
import getDefaultLabelmapConfig from '../../tools/displayTools/Labelmap/labelmapConfig';
import getDefaultSurfaceConfig from '../../tools/displayTools/Surface/surfaceConfig';
import type {
  RepresentationConfig,
  SegmentRepresentationConfig,
  Segmentation,
  SegmentationRepresentation,
  SegmentationRepresentationConfig,
  SegmentationRepresentationData,
  SegmentationState,
} from '../../types/SegmentationStateTypes';
import {
  LabelmapSegmentationDataStack,
  LabelmapSegmentationDataVolume,
} from '../../types/LabelmapTypes';
import { convertStackToVolumeSegmentation } from './convertStackToVolumeSegmentation';

const newGlobalConfig: SegmentationRepresentationConfig = {
  renderInactiveRepresentations: true,
  representations: {
    [SegmentationRepresentations.Labelmap]: getDefaultLabelmapConfig(),
    [SegmentationRepresentations.Contour]: getDefaultContourConfig(),
    [SegmentationRepresentations.Surface]: getDefaultSurfaceConfig(),
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

  /**
   * A map between segmentationIds and within each segmentation, another
   * map between imageIds and labelmap imageIds.
   */
  private _stackLabelmapImageIdReferenceMap = new Map<
    string,
    Map<string, string>
  >();

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

    if (
      segmentation.representationData.LABELMAP &&
      'volumeId' in segmentation.representationData.LABELMAP &&
      !('imageIds' in segmentation.representationData.LABELMAP)
    ) {
      const imageIds = this.getLabelmapImageIds(
        segmentation.representationData
      );
      (
        segmentation.representationData
          .LABELMAP as LabelmapSegmentationDataStack
      ).imageIds = imageIds;
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
  addRepresentation(
    segmentationRepresentation: SegmentationRepresentation
  ): void {
    const { segmentationRepresentationUID } = segmentationRepresentation;
    this.state.representations[segmentationRepresentationUID] =
      segmentationRepresentation;
  }

  /**
   * Adds a segmentation representation to the specified viewport.
   * @param viewportId - The ID of the viewport.
   * @param segmentationRepresentationUID - The UID of the segmentation representation.
   */
  addRepresentationToViewport(
    viewportId: string,
    segmentationRepresentationUID: string
  ): void {
    const enabledElement = getEnabledElementByViewportId(viewportId);

    if (!enabledElement) {
      return;
    }

    if (!this.state.viewports[viewportId]) {
      this.state.viewports[viewportId] = {};
    }

    const representation = this.getSegmentationRepresentation(
      segmentationRepresentationUID
    );

    if (representation.type !== SegmentationRepresentations.Labelmap) {
      this.setActiveRepresentation(viewportId, segmentationRepresentationUID);
      return;
    }

    /**
     * Handle various scenarios for representation rendering:
     *
     * 1. Stack Labelmap on Stack Viewport:
     *    For performance, associate each viewport imageId with the correct
     *    labelmap imageId once, then store for later retrieval.
     *
     * 2. Stack Labelmap on Volume Viewport:
     *    Create a volume labelmap from the stack labelmap. Generate a volume
     *    buffer and create separate views for each stack labelmap imageId
     *    to avoid data duplication.
     *
     * 3. Volume Labelmap on Stack Viewport:
     *    Render associated linked imageIds if available. Verify metadata
     *    supports labelmap rendering on the stack viewport. Check for
     *    potential matches between imageIds and labelmap imageIds.
     *
     * 4. Volume Labelmap on Volume Viewport:
     *    Simplest scenario. Ensure the referencedFrameOfReferenceUID
     *    (from referencedVolumeId) matches between labelmap and viewport
     *    before rendering.
     */

    const volumeViewport =
      enabledElement.viewport instanceof BaseVolumeViewport;

    const segmentation = this.getSegmentation(representation.segmentationId);

    const { representationData } = segmentation;

    const isBaseVolumeSegmentation = 'volumeId' in representationData.LABELMAP;

    if (!volumeViewport) {
      // Stack Viewport

      if (isBaseVolumeSegmentation) {
        // Volume Labelmap on Stack Viewport
        // TODO: Implement
      } else {
        // Stack Labelmap on Stack Viewport
        this.updateSegmentationImageReferences(
          viewportId,
          segmentation.segmentationId
        );
      }
    } else {
      // Volume Viewport

      // here we need check if the segmentation a volume segmentation and from the
      // same Frame of Reference UID as the viewport, if so we are fine, if it is
      // a stack segmentation and still from the same FOR we are able to convert
      // the segmentation to a volume segmentation and render it on the volume viewport
      // as well

      const volumeViewport = enabledElement.viewport as Types.IVolumeViewport;
      const frameOfReferenceUID = volumeViewport.getFrameOfReferenceUID();

      if (!isBaseVolumeSegmentation) {
        const imageIds = this.getLabelmapImageIds(
          segmentation.representationData
        );
        const segImage = cache.getImage(imageIds[0]);
        if (segImage?.FrameOfReferenceUID === frameOfReferenceUID) {
          convertStackToVolumeSegmentation(segmentation);
        }
      } else {
        // TODO: Implement Volume Labelmap on Volume Viewport
      }
    }

    // make all the other representations inactive first
    this.setActiveRepresentation(viewportId, segmentationRepresentationUID);
  }

  /**
   * Updates the segmentation image references for a given viewport and segmentation representation.
   * @param viewportId - The ID of the viewport.
   * @param segmentationId - The Id of the segmentation representation.
   * @returns The labelmap imageId reference for the current imageId rendered on the viewport.
   */
  updateSegmentationImageReferences(viewportId, segmentationId): string {
    const segmentation = this.getSegmentation(segmentationId);
    if (!segmentation) {
      return;
    }

    if (!this._stackLabelmapImageIdReferenceMap.has(segmentationId)) {
      this._stackLabelmapImageIdReferenceMap.set(segmentationId, new Map());
    }

    const { representationData } = segmentation;

    const labelmapImageIds = this.getLabelmapImageIds(representationData);
    const enabledElement = getEnabledElementByViewportId(viewportId);

    const stackViewport = enabledElement.viewport as Types.IStackViewport;
    const currentImageId = stackViewport.getCurrentImageId();

    for (const labelmapImageId of labelmapImageIds) {
      const viewableImageId = stackViewport.isReferenceViewable(
        { referencedImageId: labelmapImageId },
        { asOverlay: true }
      );

      if (viewableImageId) {
        this._stackLabelmapImageIdReferenceMap
          .get(segmentationId)
          .set(currentImageId, labelmapImageId);
      }
    }

    return this._stackLabelmapImageIdReferenceMap
      .get(segmentationId)
      .get(currentImageId);
  }

  private getLabelmapImageIds(
    representationData: SegmentationRepresentationData
  ) {
    const labelmapData = representationData.LABELMAP;
    let labelmapImageIds;

    if ((labelmapData as LabelmapSegmentationDataStack).imageIds) {
      labelmapImageIds = (labelmapData as LabelmapSegmentationDataStack)
        .imageIds;
    } else if (
      !labelmapImageIds &&
      (labelmapData as LabelmapSegmentationDataVolume).volumeId
    ) {
      // means we are dealing with a volume labelmap that is requested
      // to be rendered on a stack viewport, since we have moved to creating
      // associated imageIds and views for volume we can simply use the
      // volume.imageIds for this
      const volumeId = (labelmapData as LabelmapSegmentationDataVolume)
        .volumeId;

      const volume = cache.getVolume(volumeId) as Types.IImageVolume;
      labelmapImageIds = volume.imageIds;
    }
    return labelmapImageIds;
  }

  /**
   * Retrieves the stack labelmap imageIds associated with the current imageId
   * that is rendered on the viewport.
   * @param viewportId - The ID of the viewport.
   * @param segmentationId - The UID of the segmentation representation.
   * @returns A Map object containing the image ID reference map, or undefined if the enabled element is not found.
   */
  getLabelmapImageIdsForViewport(
    viewportId: string,
    segmentationId: string
  ): string | undefined {
    const enabledElement = getEnabledElementByViewportId(viewportId);

    if (!enabledElement) {
      return;
    }

    if (!this._stackLabelmapImageIdReferenceMap.has(segmentationId)) {
      return;
    }

    const stackViewport = enabledElement.viewport as Types.IStackViewport;
    const currentImageId = stackViewport.getCurrentImageId();

    const imageIdReferenceMap =
      this._stackLabelmapImageIdReferenceMap.get(segmentationId);

    return imageIdReferenceMap.get(currentImageId);
  }

  /**
   * Retrieves an array of segmentation representations for a given viewport.
   * @param viewportId - The ID of the viewport.
   * @returns An array of SegmentationRepresentation objects.
   */
  getAllSegmentationRepresentationsForViewport(
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
  removeRepresentation(segmentationRepresentationUID: string): void {
    delete this.state.representations[segmentationRepresentationUID];

    // remove it from every viewports as well
    Object.keys(this.state.viewports).forEach((viewportId) => {
      delete this.state.viewports[viewportId][segmentationRepresentationUID];
    });
  }

  /**
   * Set the active segmentation representation for the give viewport
   * @param viewportId - The Id of the tool group that owns the
   * segmentation data.
   * @param segmentationRepresentationUID - string
   */
  setActiveRepresentation(
    viewportId: string,
    segmentationRepresentationUID: string
  ): void {
    Object.keys(this.state.viewports[viewportId]).forEach((segRepUID) => {
      this.state.viewports[viewportId][segRepUID].active = false;
    });

    if (!this.state.viewports[viewportId]) {
      this.state.viewports[viewportId] = {};
    }

    if (!this.state.viewports[viewportId][segmentationRepresentationUID]) {
      this.state.viewports[viewportId][segmentationRepresentationUID] = {
        active: false,
        visible: true,
        segmentsHidden: new Set(),
      };
    }

    this.state.viewports[viewportId][segmentationRepresentationUID].active =
      true;
  }

  getActiveRepresentation(
    viewportId: string
  ): SegmentationRepresentation | undefined {
    if (!this.state.viewports?.[viewportId]) {
      return;
    }

    const activeSegRep = Object.entries(this.state.viewports[viewportId]).find(
      ([, value]) => value.active
    );

    if (!activeSegRep) {
      return;
    }

    return this.getSegmentationRepresentation(activeSegRep[0]);
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

  _getRepresentationConfig(segmentationRepresentationUID: string): {
    allSegments?: RepresentationConfig;
    perSegment?: SegmentRepresentationConfig;
  } {
    const segmentationRepresentation = this.getSegmentationRepresentation(
      segmentationRepresentationUID
    );

    if (!segmentationRepresentation) {
      return;
    }

    return segmentationRepresentation.config;
  }

  /**
   * Returns the default representation config for the given segmentation representation UID.
   * that is used for all segments.
   * @param segmentationRepresentationUID - The UID of the segmentation representation.
   * @returns The default representation config object.
   */
  getAllSegmentsConfig(
    segmentationRepresentationUID: string
  ): RepresentationConfig {
    const config = this._getRepresentationConfig(segmentationRepresentationUID);

    if (!config) {
      return;
    }

    return config.allSegments;
  }

  /**
   * Retrieves the configuration for per-segment settings of a segmentation representation.
   *
   * @param segmentationRepresentationUID - The unique identifier of the segmentation representation.
   * @returns The configuration for per-segment settings, or undefined if the segmentation representation is not found.
   */
  getPerSegmentConfig(
    segmentationRepresentationUID: string
  ): SegmentRepresentationConfig {
    const config = this._getRepresentationConfig(segmentationRepresentationUID);

    if (!config) {
      return;
    }

    return config.perSegment;
  }

  /**
   * Sets the configuration for all segments of a segmentation representation.
   *
   * @param segmentationRepresentationUID - The UID of the segmentation representation.
   * @param config - The configuration to be set for all segments.
   */
  setAllSegmentsConfig(
    segmentationRepresentationUID: string,
    config: RepresentationConfig
  ): void {
    const _config = this._getRepresentationConfig(
      segmentationRepresentationUID
    );

    if (!_config) {
      return;
    }

    _config.allSegments = config;
  }

  /**
   * Sets the configuration for per-segment settings of a segmentation representation.
   *
   * @param segmentationRepresentationUID - The unique identifier of the segmentation representation.
   * @param config - The configuration for per-segment settings.
   */
  setPerSegmentConfig(
    segmentationRepresentationUID: string,
    config: SegmentRepresentationConfig
  ): void {
    const _config = this._getRepresentationConfig(
      segmentationRepresentationUID
    );

    if (!_config) {
      return;
    }

    _config.perSegment = config;
  }

  /**
   * Returns the visibility of a segmentation representation in a specific viewport.
   * @param viewportId - The ID of the viewport.
   * @param segmentationRepresentationUID - The UID of the segmentation representation.
   * @returns The visibility of the segmentation representation in the viewport.
   */
  getSegmentationRepresentationVisibility(
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
  setRepresentationVisibility(
    viewportId: string,
    segmentationRepresentationUID: string,
    visible: boolean
  ): void {
    if (!this.state.viewports[viewportId]) {
      this.state.viewports[viewportId] = {};
    }

    this.state.viewports[viewportId][segmentationRepresentationUID].visible =
      visible;
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

  /**
   * For simplicity we just take the last 15% of the imageId for each
   * and join them
   * @param imageIds - imageIds
   * @returns
   */
  _getStackIdForImageIds(imageIds: string[]): string {
    return imageIds
      .map((imageId) => imageId.slice(-Math.round(imageId.length * 0.15)))
      .join('_');
  }
}

const defaultSegmentationStateManager = new SegmentationStateManager('DEFAULT');
export { defaultSegmentationStateManager };
