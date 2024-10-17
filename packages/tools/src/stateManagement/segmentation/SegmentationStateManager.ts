import type { Types } from '@cornerstonejs/core';
import {
  BaseVolumeViewport,
  cache,
  utilities as csUtils,
  getEnabledElementByViewportId,
  volumeLoader,
} from '@cornerstonejs/core';

import { SegmentationRepresentations } from '../../enums';
import type {
  ContourRenderingConfig,
  LabelmapRenderingConfig,
  RenderingConfig,
  RepresentationsData,
  Segmentation,
  SegmentationRepresentation,
  SegmentationState,
} from '../../types/SegmentationStateTypes';
import type {
  LabelmapSegmentationDataStack,
  LabelmapSegmentationDataVolume,
} from '../../types/LabelmapTypes';
import vtkColorTransferFunction from '@kitware/vtk.js/Rendering/Core/ColorTransferFunction';
import vtkPiecewiseFunction from '@kitware/vtk.js/Common/DataModel/PiecewiseFunction';
import {
  triggerSegmentationModified,
  triggerSegmentationRemoved,
  triggerSegmentationRepresentationModified,
  triggerSegmentationRepresentationRemoved,
} from './triggerSegmentationEvents';
import { segmentationStyle } from './SegmentationStyle';

const initialDefaultState: SegmentationState = {
  colorLUT: [],
  segmentations: [],
  viewportSegRepresentations: {},
};

/**
 * The SegmentationStateManager Class is responsible for managing the state of the
 * segmentations. It stores the segmentations, segmentation representations,
 * and viewport-specific visibility of the representations. It also stores a global
 * config for segmentation rendering. Note that this is a singleton state manager.
 */
export default class SegmentationStateManager {
  private state: Readonly<SegmentationState>;
  public readonly uid: string;

  /**
   * A map between segmentationIds and within each segmentation, another
   * map between imageIds and labelmap imageIds.
   */
  private _stackLabelmapImageIdReferenceMap = new Map<
    string,
    Map<string, string>
  >();

  /**
   * Creates an instance of SegmentationStateManager.
   * @param {string} [uid] - Optional unique identifier for the manager.
   */
  constructor(uid?: string) {
    uid ||= csUtils.uuidv4();
    this.state = Object.freeze(
      csUtils.deepClone(initialDefaultState) as SegmentationState
    );
    this.uid = uid;
  }

  /**
   * Returns a copy of the current state of the segmentation.
   */
  getState(): Readonly<SegmentationState> {
    return this.state;
  }

  // Helper method to update state immutably
  private updateState(updater: (state: SegmentationState) => void): void {
    const newState = csUtils.deepClone(this.state) as SegmentationState;
    updater(newState);
    this.state = Object.freeze(newState);
  }

  /**
   * Returns the colorLUT at the specified index.
   * @param {number} lutIndex - The index of the color LUT to retrieve.
   * @returns {Types.ColorLUT | undefined} A ColorLUT object or undefined if not found.
   */
  getColorLUT(lutIndex: number): Types.ColorLUT | undefined {
    return this.state.colorLUT[lutIndex];
  }

  /**
   * Returns the next available color LUT index.
   * @returns {number} The next color LUT index.
   */
  getNextColorLUTIndex(): number {
    return this.state.colorLUT.length;
  }

  /**
   * Resets the state to the default state.
   */
  resetState(): void {
    this.state = Object.freeze(
      csUtils.deepClone(initialDefaultState) as SegmentationState
    );
  }

  /**
   * Returns the segmentation state for the given segmentation ID.
   * @param {string} segmentationId - The ID of the segmentation.
   * @returns {Segmentation | undefined} The segmentation state object or undefined if not found.
   */
  getSegmentation(segmentationId: string): Segmentation | undefined {
    return this.state.segmentations.find(
      (segmentation) => segmentation.segmentationId === segmentationId
    );
  }

  /**
   * Updates an existing segmentation with new data.
   *
   * @param segmentationId - The unique identifier of the segmentation to update.
   * @param payload - An object containing the properties to update in the segmentation.
   *
   * @remarks
   * This method updates the state immutably. If the segmentation with the given ID is not found,
   * the method will return without making any changes.
   *
   * @example
   * ```typescript
   * segmentationStateManager.updateSegmentation('seg1', { label: 'newLabel' });
   * ```
   */
  // updateSegmentation(
  //   segmentationId: string,
  //   payload: Partial<Segmentation>
  // ): void {
  //   this.updateState((state) => {
  //     const segmentation = state.segmentations.find(
  //       (segmentation) => segmentation.segmentationId === segmentationId
  //     );
  //     if (!segmentation) {
  //       return;
  //     }
  //     state.segmentations = state.segmentations.map((segmentation) => {
  //       if (segmentation.segmentationId === segmentationId) {
  //         return { ...segmentation, ...payload };
  //       }
  //       return segmentation;
  //     });
  //   });
  // }
  updateSegmentation(
    segmentationId: string,
    payload: Partial<Segmentation>
  ): void {
    this.updateState((draftState) => {
      const segmentation = draftState.segmentations.find(
        (segmentation) => segmentation.segmentationId === segmentationId
      );

      if (!segmentation) {
        console.warn(
          `Segmentation with id ${segmentationId} not found. Update aborted.`
        );
        return;
      }

      // Directly mutate the draft state
      Object.assign(segmentation, payload);
    });

    triggerSegmentationModified(segmentationId);
  }

  /**
   * Adds a segmentation to the segmentations array.
   * @param {Segmentation} segmentation - The segmentation object to add.
   * @throws {Error} If a segmentation with the same ID already exists.
   */
  addSegmentation(segmentation: Segmentation): void {
    if (this.getSegmentation(segmentation.segmentationId)) {
      throw new Error(
        `Segmentation with id ${segmentation.segmentationId} already exists`
      );
    }

    this.updateState((state) => {
      const newSegmentation = csUtils.deepClone(segmentation) as Segmentation;
      if (
        newSegmentation.representationData.Labelmap &&
        'volumeId' in newSegmentation.representationData.Labelmap &&
        !('imageIds' in newSegmentation.representationData.Labelmap)
      ) {
        const imageIds = this.getLabelmapImageIds(
          newSegmentation.representationData
        );
        (
          newSegmentation.representationData
            .Labelmap as LabelmapSegmentationDataStack
        ).imageIds = imageIds;
      }
      state.segmentations.push(newSegmentation);
    });

    triggerSegmentationModified(segmentation.segmentationId);
  }

  /**
   * Removes the segmentation from the segmentation state.
   * @param {string} segmentationId - The ID of the segmentation to remove.
   */
  removeSegmentation(segmentationId: string): void {
    this.updateState((state) => {
      state.segmentations = state.segmentations.filter(
        (segmentation) => segmentation.segmentationId !== segmentationId
      );

      // remove the segmentation representation from all viewports
      Object.values(state.viewportSegRepresentations).forEach(
        (representations) => {
          representations = representations.filter(
            (representation) => representation.segmentationId !== segmentationId
          );
        }
      );
    });

    triggerSegmentationRemoved(segmentationId);
  }

  /**
   * Adds a segmentation representation to the specified viewport.
   * @param {string} viewportId - The ID of the viewport.
   * @param {string} segmentationId - The ID of the segmentation.
   * @param {SegmentationRepresentations} type - The type of segmentation representation.
   * @param {RenderingConfig} renderingConfig - The rendering configuration for the segmentation.
   */
  addSegmentationRepresentation(
    viewportId: string,
    segmentationId: string,
    type: SegmentationRepresentations,
    renderingConfig: RenderingConfig
  ): void {
    const enabledElement = getEnabledElementByViewportId(viewportId);

    if (!enabledElement) {
      return;
    }

    this.updateState((state) => {
      if (!state.viewportSegRepresentations[viewportId]) {
        state.viewportSegRepresentations[viewportId] = [];
        segmentationStyle.setRenderInactiveSegmentations(viewportId, true);
      }

      if (type !== SegmentationRepresentations.Labelmap) {
        this.addDefaultSegmentationRepresentation(
          state,
          viewportId,
          segmentationId,
          type,
          renderingConfig
        );
      } else {
        this.addLabelmapRepresentation(
          state,
          viewportId,
          segmentationId,
          renderingConfig
        );
      }
    });

    triggerSegmentationRepresentationModified(viewportId, segmentationId, type);
  }

  private addDefaultSegmentationRepresentation(
    state: SegmentationState,
    viewportId: string,
    segmentationId: string,
    type: SegmentationRepresentations,
    renderingConfig: RenderingConfig
  ) {
    const segmentation = state.segmentations.find(
      (segmentation) => segmentation.segmentationId === segmentationId
    );

    if (!segmentation) {
      return;
    }

    const segmentReps = {};
    Object.keys(segmentation.segments).forEach((segmentIndex) => {
      segmentReps[Number(segmentIndex)] = {
        visible: true,
      };
    });

    state.viewportSegRepresentations[viewportId].push({
      segmentationId,
      type,
      active: true,
      visible: true,
      colorLUTIndex: 0,
      segments: segmentReps,
      config: {
        ...getDefaultRenderingConfig(type),
        ...renderingConfig,
      },
    });

    this._setActiveSegmentation(state, viewportId, segmentationId);
  }

  addLabelmapRepresentation(
    state: SegmentationState,
    viewportId: string,
    segmentationId: string,
    renderingConfig: RenderingConfig = getDefaultRenderingConfig(
      SegmentationRepresentations.Labelmap
    )
  ) {
    const enabledElement = getEnabledElementByViewportId(viewportId);

    if (!enabledElement) {
      return;
    }

    const segmentation = this.getSegmentation(segmentationId);

    if (!segmentation) {
      return;
    }

    const { representationData } = segmentation;

    // if type is labelmap and we don't have the representation data we need to get it
    // through polySeg so just return
    if (!representationData.Labelmap) {
      return this.addDefaultSegmentationRepresentation(
        state,
        viewportId,
        segmentationId,
        SegmentationRepresentations.Labelmap,
        renderingConfig
      );
    }

    this.processLabelmapRepresentationAddition(viewportId, segmentationId);

    this.addDefaultSegmentationRepresentation(
      state,
      viewportId,
      segmentationId,
      SegmentationRepresentations.Labelmap,
      renderingConfig
    );
  }

  /**
   * Processes the addition of a labelmap representation for a given viewport and segmentation.
   * This method handles various scenarios for representation rendering based on the viewport type
   * and the segmentation data.
   *
   * @param viewportId - The ID of the viewport where the labelmap representation will be added.
   * @param segmentationId - The ID of the segmentation to be processed.
   * @param renderingConfig - The configuration for rendering the labelmap representation.
   *
   * @remarks
   * This method handles four main scenarios:
   * 1. Stack Labelmap on Stack Viewport
   * 2. Stack Labelmap on Volume Viewport
   * 3. Volume Labelmap on Stack Viewport
   * 4. Volume Labelmap on Volume Viewport
   *
   * Each scenario requires different processing steps to ensure proper rendering and performance optimization.
   */
  public async processLabelmapRepresentationAddition(
    viewportId: string,
    segmentationId: string
  ) {
    const enabledElement = getEnabledElementByViewportId(viewportId);

    if (!enabledElement) {
      return;
    }

    const segmentation = this.getSegmentation(segmentationId);

    if (!segmentation) {
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

    const { representationData } = segmentation;

    const isBaseVolumeSegmentation = 'volumeId' in representationData.Labelmap;
    const viewport = enabledElement.viewport;
    if (!volumeViewport && !isBaseVolumeSegmentation) {
      // Stack Viewport
      !this.updateLabelmapSegmentationImageReferences(
        viewportId,
        segmentation.segmentationId
      );
    }
  }

  /**
   * Helper function to update labelmap segmentation image references.
   * @param {string} segmentationId - The ID of the segmentation representation.
   * @param {Types.IViewport} viewport - The viewport.
   * @param {string[]} labelmapImageIds - The labelmap image IDs.
   * @param {Function} updateCallback - A callback to update the reference map.
   * @returns {string | undefined} The labelmap imageId reference for the current imageId rendered on the viewport.
   */
  _updateLabelmapSegmentationReferences(
    segmentationId,
    viewport,
    labelmapImageIds,
    updateCallback
  ): string | undefined {
    const currentImageId = viewport.getCurrentImageId();

    let viewableLabelmapImageIdFound = false;
    for (const labelmapImageId of labelmapImageIds) {
      const viewableImageId = viewport.isReferenceViewable(
        { referencedImageId: labelmapImageId },
        { asOverlay: true }
      );

      if (viewableImageId) {
        viewableLabelmapImageIdFound = true;
        this._stackLabelmapImageIdReferenceMap
          .get(segmentationId)
          .set(currentImageId, labelmapImageId);
      }
    }

    if (updateCallback) {
      updateCallback(viewport, segmentationId, labelmapImageIds);
    }

    return viewableLabelmapImageIdFound
      ? this._stackLabelmapImageIdReferenceMap
          .get(segmentationId)
          .get(currentImageId)
      : undefined;
  }

  /**
   * Updates the segmentation image references for a given viewport and segmentation representation.
   * @param {string} viewportId - The ID of the viewport.
   * @param {string} segmentationId - The Id of the segmentation representation.
   * @returns {string | undefined} The labelmap imageId reference for the current imageId rendered on the viewport.
   */
  updateLabelmapSegmentationImageReferences(viewportId, segmentationId) {
    const segmentation = this.getSegmentation(segmentationId);
    if (!segmentation) {
      return;
    }

    if (!this._stackLabelmapImageIdReferenceMap.has(segmentationId)) {
      this._stackLabelmapImageIdReferenceMap.set(segmentationId, new Map());
    }

    const { representationData } = segmentation;
    if (!representationData.Labelmap) {
      return;
    }

    const labelmapImageIds = this.getLabelmapImageIds(representationData);
    const enabledElement = getEnabledElementByViewportId(viewportId);
    const stackViewport = enabledElement.viewport as Types.IStackViewport;

    return this._updateLabelmapSegmentationReferences(
      segmentationId,
      stackViewport,
      labelmapImageIds,
      null
    );
  }

  /**
   * Updates all segmentation image references for a given viewport and segmentation representation.
   * @param {string} viewportId - The ID of the viewport.
   * @param {string} segmentationId - The Id of the segmentation representation.
   * @returns {string | undefined} The labelmap imageId reference for the current imageId rendered on the viewport.
   */
  _updateAllLabelmapSegmentationImageReferences(viewportId, segmentationId) {
    const segmentation = this.getSegmentation(segmentationId);
    if (!segmentation) {
      return;
    }

    if (!this._stackLabelmapImageIdReferenceMap.has(segmentationId)) {
      this._stackLabelmapImageIdReferenceMap.set(segmentationId, new Map());
    }

    const { representationData } = segmentation;
    if (!representationData.Labelmap) {
      return;
    }

    const labelmapImageIds = this.getLabelmapImageIds(representationData);
    const enabledElement = getEnabledElementByViewportId(viewportId);
    const stackViewport = enabledElement.viewport as Types.IStackViewport;

    this._updateLabelmapSegmentationReferences(
      segmentationId,
      stackViewport,
      labelmapImageIds,
      (stackViewport, segmentationId, labelmapImageIds) => {
        const imageIds = stackViewport.getImageIds();
        imageIds.forEach((imageId, index) => {
          for (const labelmapImageId of labelmapImageIds) {
            const viewableImageId = stackViewport.isReferenceViewable(
              { referencedImageId: labelmapImageId, sliceIndex: index },
              { asOverlay: true, withNavigation: true }
            );

            if (viewableImageId) {
              this._stackLabelmapImageIdReferenceMap
                .get(segmentationId)
                .set(imageId, labelmapImageId);
            }
          }
        });
      }
    );
  }

  /**
   * Retrieves the labelmap image IDs for a given representation data.
   * @param {RepresentationsData} representationData - The representation data.
   * @returns {string[]} An array of labelmap image IDs.
   */
  public getLabelmapImageIds(representationData: RepresentationsData) {
    const labelmapData = representationData.Labelmap;
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
   * Retrieves the stack labelmap imageId associated with the current imageId
   * that is rendered on the viewport.
   * @param viewportId - The ID of the viewport.
   * @param segmentationId - The UID of the segmentation representation.
   * @returns A Map object containing the image ID reference map, or undefined if the enabled element is not found.
   */
  getCurrentLabelmapImageIdForViewport(
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
   * Retrieves all labelmap image IDs associated with a segmentation for a given viewport.
   *
   * @param viewportId - The ID of the viewport.
   * @param segmentationId - The ID of the segmentation.
   * @returns An array of labelmap image IDs. Returns an empty array if the segmentation is not found.
   */
  getStackSegmentationImageIdsForViewport(
    viewportId: string,
    segmentationId: string
  ): string[] {
    const segmentation = this.getSegmentation(segmentationId);

    if (!segmentation) {
      return [];
    }

    this._updateAllLabelmapSegmentationImageReferences(
      viewportId,
      segmentationId
    );
    const { viewport } = getEnabledElementByViewportId(viewportId);
    const imageIds = viewport.getImageIds();

    const associatedReferenceImageAndLabelmapImageIds =
      this._stackLabelmapImageIdReferenceMap.get(segmentationId);

    return imageIds.map((imageId) => {
      return associatedReferenceImageAndLabelmapImageIds.get(imageId);
    });
  }

  private removeSegmentationRepresentationsInternal(
    viewportId: string,
    specifier?: {
      segmentationId?: string;
      type?: SegmentationRepresentations;
    }
  ): Array<{
    segmentationId: string;
    type: SegmentationRepresentations;
  }> {
    const removedRepresentations: Array<{
      segmentationId: string;
      type: SegmentationRepresentations;
    }> = [];

    this.updateState((state) => {
      if (!state.viewportSegRepresentations[viewportId]) {
        return;
      }

      const currentRepresentations =
        state.viewportSegRepresentations[viewportId];
      let activeRepresentationRemoved = false;

      if (
        !specifier ||
        Object.values(specifier).every((value) => value === undefined)
      ) {
        // Remove all segmentation representations for the viewport
        removedRepresentations.push(...currentRepresentations);
        delete state.viewportSegRepresentations[viewportId];
      } else {
        const { segmentationId, type } = specifier;

        state.viewportSegRepresentations[viewportId] =
          currentRepresentations.filter((representation) => {
            const shouldRemove =
              (segmentationId &&
                type &&
                representation.segmentationId === segmentationId &&
                representation.type === type) ||
              (segmentationId &&
                !type &&
                representation.segmentationId === segmentationId) ||
              (!segmentationId && type && representation.type === type);

            if (shouldRemove) {
              removedRepresentations.push(representation);
              if (representation.active) {
                activeRepresentationRemoved = true;
              }
            }

            return !shouldRemove;
          });

        // If no representations left for the viewport, remove the viewport entry
        if (state.viewportSegRepresentations[viewportId].length === 0) {
          delete state.viewportSegRepresentations[viewportId];
        } else if (activeRepresentationRemoved) {
          // Set the first remaining representation as active
          state.viewportSegRepresentations[viewportId][0].active = true;
        }
      }

      // If all representations were removed and there was an active one among them,
      // we don't need to set a new active representation as the viewport entry was deleted.
    });

    return removedRepresentations;
  }

  /**
   * Removes segmentation representations from a viewport based on the provided specifier.
   *
   * @param viewportId - The ID of the viewport.
   * @param specifier - Optional. An object specifying which representations to remove.
   * @param specifier.segmentationId - Optional. The ID of the segmentation to remove.
   * @param specifier.type - Optional. The type of representation to remove.
   * @returns An array of removed segmentation representations.
   *
   * @remarks
   * If no specifier is provided, all segmentation representations for the viewport are removed.
   * If only segmentationId is provided, all representations of that segmentation are removed.
   * If only type is provided, all representations of that type are removed.
   * If both segmentationId and type are provided, only the specific representation is removed.
   */
  removeSegmentationRepresentations(
    viewportId: string,
    specifier?: {
      segmentationId?: string;
      type?: SegmentationRepresentations;
    }
  ): Array<{
    segmentationId: string;
    type: SegmentationRepresentations;
  }> {
    const removedRepresentations =
      this.removeSegmentationRepresentationsInternal(viewportId, specifier);

    // Trigger events for all removed representations
    removedRepresentations.forEach((representation) => {
      triggerSegmentationRepresentationRemoved(
        viewportId,
        representation.segmentationId,
        representation.type
      );
    });

    // If there are remaining representations, trigger a modified event for the new active one
    const remainingRepresentations =
      this.getSegmentationRepresentations(viewportId);
    if (
      remainingRepresentations.length > 0 &&
      remainingRepresentations[0].active
    ) {
      triggerSegmentationRepresentationModified(
        viewportId,
        remainingRepresentations[0].segmentationId,
        remainingRepresentations[0].type
      );
    }

    return removedRepresentations;
  }

  /**
   * Removes a specific segmentation representation from a viewport.
   *
   * @param viewportId - The ID of the viewport.
   * @param specifier - An object specifying which representation to remove.
   * @param specifier.segmentationId - The ID of the segmentation to remove.
   * @param specifier.type - The type of representation to remove.
   * @param suppressEvent - Optional. If true, suppresses the removal event trigger.
   * @returns An array of removed segmentation representations (usually containing one item).
   *
   * @remarks
   * This method is more specific than removeSegmentationRepresentations as it requires both
   * segmentationId and type to be provided. It's useful when you need to remove a particular
   * representation without affecting others.
   */
  removeSegmentationRepresentation(
    viewportId: string,
    specifier: {
      segmentationId: string;
      type: SegmentationRepresentations;
    },
    suppressEvent?: boolean
  ): Array<{ segmentationId: string; type: SegmentationRepresentations }> {
    const removedRepresentations =
      this.removeSegmentationRepresentationsInternal(viewportId, specifier);

    if (!suppressEvent) {
      removedRepresentations.forEach(({ segmentationId, type }) => {
        triggerSegmentationRepresentationRemoved(
          viewportId,
          segmentationId,
          type
        );
      });
    }

    return removedRepresentations;
  }

  _setActiveSegmentation(
    state: SegmentationState,
    viewportId: string,
    segmentationId: string
  ): void {
    const viewport = state.viewportSegRepresentations[viewportId];

    if (!viewport) {
      return;
    }

    viewport.forEach((value) => {
      value.active = value.segmentationId === segmentationId;
    });
  }

  /**
   * Sets the active segmentation for a given viewport.
   * @param viewportId - The ID of the viewport.
   * @param segmentationId - The ID of the segmentation to set as active.
   */
  public setActiveSegmentation(
    viewportId: string,
    segmentationId: string
  ): void {
    this.updateState((state) => {
      const viewport = state.viewportSegRepresentations[viewportId];

      if (!viewport) {
        return;
      }

      viewport.forEach((value) => {
        value.active = value.segmentationId === segmentationId;
      });
    });

    triggerSegmentationRepresentationModified(viewportId, segmentationId);
  }

  /**
   * Retrieves the active segmentation representation for a given viewport.
   * @param viewportId - The ID of the viewport.
   * @returns The active segmentation representation, or undefined if not found.
   */
  getActiveSegmentation(viewportId: string): Segmentation | undefined {
    if (!this.state.viewportSegRepresentations[viewportId]) {
      return;
    }

    const activeSegRep = this.state.viewportSegRepresentations[viewportId].find(
      (segRep) => segRep.active
    );

    if (!activeSegRep) {
      return;
    }

    return this.getSegmentation(activeSegRep.segmentationId);
  }

  /**
   * Retrieves the segmentation representations for a given viewport.
   * @param viewportId - The ID of the viewport.
   * @param specifier - The specifier for the segmentation representations.
   * @returns The segmentation representations for the given viewport, or an empty array if not found.
   *
   * @remarks
   * This method filters the segmentation representations based on the provided specifier.
   * If no specifier is provided, it returns all segmentation representations for the viewport.
   * The filtering is done based on the segmentation type and/or segmentation ID if provided in the specifier.
   * If the viewport has no representations, an empty array is returned.
   */
  getSegmentationRepresentations(
    viewportId: string,
    specifier: {
      segmentationId?: string;
      type?: SegmentationRepresentations;
    } = {}
  ): SegmentationRepresentation[] {
    const viewportRepresentations =
      this.state.viewportSegRepresentations[viewportId];

    if (!viewportRepresentations) {
      return [];
    }

    // If no specifier is provided, return all entries
    if (!specifier.type && !specifier.segmentationId) {
      return viewportRepresentations;
    }

    return viewportRepresentations.filter((representation) => {
      const typeMatch = specifier.type
        ? representation.type === specifier.type
        : true;
      const idMatch = specifier.segmentationId
        ? representation.segmentationId === specifier.segmentationId
        : true;
      return typeMatch && idMatch;
    });
  }

  /**
   * Retrieves a specific segmentation representation for a given viewport.
   *
   * @param viewportId - The ID of the viewport.
   * @param specifier - An object specifying the segmentation to retrieve.
   * @param specifier.segmentationId - The ID of the segmentation.
   * @param specifier.type - The type of the segmentation representation.
   * @returns The first matching segmentation representation, or undefined if not found.
   *
   */
  getSegmentationRepresentation(
    viewportId: string,
    specifier: {
      segmentationId: string;
      type: SegmentationRepresentations;
    }
  ): SegmentationRepresentation | undefined {
    // if type is provided, return the first one that matches the type
    return this.getSegmentationRepresentations(viewportId, specifier)[0];
  }

  /**
   * Retrieves the visibility of a segmentation representation for a given viewport.
   * @param viewportId - The ID of the viewport.
   * @param specifier - The specifier for the segmentation representation.
   * @returns The visibility of the segmentation representation, or undefined if not found.
   */
  getSegmentationRepresentationVisibility(
    viewportId: string,
    specifier: {
      segmentationId: string;
      type: SegmentationRepresentations;
    }
  ): boolean {
    const viewportRepresentation = this.getSegmentationRepresentation(
      viewportId,
      specifier
    );

    return viewportRepresentation?.visible;
  }

  /**
   * Sets the visibility of a segmentation representation in a specific viewport.
   * @param viewportId - The ID of the viewport.
   * @param segmentationId - The ID of the segmentation.
   * @param type - The type of the segmentation representation.
   * @param visible - The visibility to set for the segmentation representation in the viewport.
   */
  setSegmentationRepresentationVisibility(
    viewportId: string,
    specifier: {
      segmentationId: string;
      type: SegmentationRepresentations;
    },
    visible: boolean
  ): void {
    this.updateState((state) => {
      const viewportRepresentations = this.getSegmentationRepresentations(
        viewportId,
        specifier
      );

      if (!viewportRepresentations) {
        return;
      }

      viewportRepresentations.forEach((representation) => {
        representation.visible = visible;

        Object.entries(representation.segments).forEach(
          ([segmentIndex, segment]) => {
            segment.visible = visible;
          }
        );
      });
    });

    triggerSegmentationRepresentationModified(
      viewportId,
      specifier.segmentationId,
      specifier.type
    );
  }

  /**
   * Adds a color LUT to the state.
   * @param colorLUT - The color LUT object to add.
   * @param lutIndex - The index of the color LUT table to add.
   */
  addColorLUT(colorLUT: Types.ColorLUT, lutIndex: number): void {
    this.updateState((state) => {
      if (state.colorLUT[lutIndex]) {
        console.warn('Color LUT table already exists, overwriting');
      }
      state.colorLUT[lutIndex] = csUtils.deepClone(colorLUT) as Types.ColorLUT;
    });
  }

  /**
   * Removes a color LUT from the state.
   * @param colorLUTIndex - The index of the color LUT table to remove.
   */
  removeColorLUT(colorLUTIndex: number): void {
    this.updateState((state) => {
      delete state.colorLUT[colorLUTIndex];
    });
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

  /**
   * Retrieves all viewport segmentation representations as an array.
   * @returns An array of objects, each containing a viewportId and its associated representations.
   */
  public getAllViewportSegmentationRepresentations(): Array<{
    viewportId: string;
    representations: SegmentationRepresentation[];
  }> {
    return Object.entries(this.state.viewportSegRepresentations).map(
      ([viewportId, representations]) => ({
        viewportId,
        representations,
      })
    );
  }
}

async function internalComputeVolumeLabelmapFromStack({
  imageIds,
  options,
}: {
  imageIds: string[];
  options?: {
    volumeId?: string;
  };
}): Promise<{ volumeId: string }> {
  const segmentationImageIds = imageIds;

  const volumeId = options?.volumeId || csUtils.uuidv4();

  // Todo: fix this
  await volumeLoader.createAndCacheVolumeFromImages(
    volumeId,
    segmentationImageIds
  );

  return { volumeId };
}

async function internalConvertStackToVolumeLabelmap({
  segmentationId,
  options,
}: {
  segmentationId: string;
  options?: {
    viewportId: string;
    volumeId?: string;
    removeOriginal?: boolean;
  };
}): Promise<void> {
  const segmentation =
    defaultSegmentationStateManager.getSegmentation(segmentationId);

  const data = segmentation.representationData
    .Labelmap as LabelmapSegmentationDataStack;

  const { volumeId } = await internalComputeVolumeLabelmapFromStack({
    imageIds: data.imageIds,
    options,
  });

  (
    segmentation.representationData.Labelmap as LabelmapSegmentationDataVolume
  ).volumeId = volumeId;
}

function getDefaultRenderingConfig(type: string): RenderingConfig {
  const cfun = vtkColorTransferFunction.newInstance();
  const ofun = vtkPiecewiseFunction.newInstance();
  ofun.addPoint(0, 0);

  if (type === SegmentationRepresentations.Labelmap) {
    return {
      cfun,
      ofun,
    } as LabelmapRenderingConfig;
  } else {
    return {} as ContourRenderingConfig;
  }
}

const defaultSegmentationStateManager = new SegmentationStateManager('DEFAULT');

export {
  internalConvertStackToVolumeLabelmap,
  internalComputeVolumeLabelmapFromStack,
  defaultSegmentationStateManager,
};
