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
import { segmentationStyle } from './SegmentationStyle';

const initialDefaultState: SegmentationState = {
  colorLUT: [],
  segmentations: [],
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

  /**
   * Creates an instance of SegmentationStateManager.
   * @param {string} [uid] - Optional unique identifier for the manager.
   */
  constructor(uid?: string) {
    if (!uid) {
      uid = csUtils.uuidv4();
    }
    this.state = structuredClone(initialDefaultState);
    this.uid = uid;
  }

  /**
   * Returns a copy of the current state of the segmentation.
   * @returns {SegmentationState} A deep copy of the segmentation state.
   */
  getState(): SegmentationState {
    return this.state;
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
    this.state = structuredClone(initialDefaultState);
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

    if (
      segmentation.representationData.Labelmap &&
      'volumeId' in segmentation.representationData.Labelmap &&
      !('imageIds' in segmentation.representationData.Labelmap)
    ) {
      const imageIds = this.getLabelmapImageIds(
        segmentation.representationData
      );
      (
        segmentation.representationData
          .Labelmap as LabelmapSegmentationDataStack
      ).imageIds = imageIds;
    }
    this.state.segmentations.push(segmentation);
  }

  /**
   * Removes the segmentation from the segmentation state.
   * @param {string} segmentationId - The ID of the segmentation to remove.
   */
  removeSegmentation(segmentationId: string): void {
    this.state.segmentations = this.state.segmentations.filter(
      (segmentation) => segmentation.segmentationId !== segmentationId
    );
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

    if (!this.state.viewports[viewportId]) {
      this.state.viewports[viewportId] = [];
      // if this is the first time we make the viewports render inactive segmentations
      // unless the user has specifically requested to render inactive segmentations
      segmentationStyle.setViewportRenderInactiveSegmentations(
        viewportId,
        true
      );
    }

    if (type !== SegmentationRepresentations.Labelmap) {
      this.state.viewports[viewportId].push({
        segmentationId,
        type,
        active: false,
        visible: true,
        segmentsHidden: new Set(),
        config: {
          ...getDefaultRenderingConfig(type),
          ...renderingConfig,
        },
      });

      this.setActiveSegmentation(viewportId, segmentationId);

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

    const segmentation = this.getSegmentation(segmentationId);

    if (!segmentation) {
      return;
    }

    const { representationData } = segmentation;

    const isBaseVolumeSegmentation = 'volumeId' in representationData.Labelmap;

    if (!volumeViewport) {
      // Stack Viewport

      if (isBaseVolumeSegmentation) {
        // Volume Labelmap on Stack Viewport
        // TODO: Implement
      } else {
        // Stack Labelmap on Stack Viewport
        this.updateLabelmapSegmentationImageReferences(
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
          internalConvertStackToVolumeLabelmap(segmentation);
        }
      } else {
        // TODO: Implement Volume Labelmap on Volume Viewport
      }
    }

    this.state.viewports[viewportId].push({
      segmentationId,
      type,
      active: true,
      visible: true,
      segmentsHidden: new Set(),
      config: {
        ...getDefaultRenderingConfig(type),
        ...renderingConfig,
      },
    });

    // make all the other representations inactive first
    this.setActiveSegmentation(viewportId, segmentationId);
  }

  /**
   * Helper function to update labelmap segmentation image references.
   * @param {string} segmentationId - The ID of the segmentation representation.
   * @param {Types.IStackViewport} stackViewport - The stack viewport.
   * @param {string[]} labelmapImageIds - The labelmap image IDs.
   * @param {Function} updateCallback - A callback to update the reference map.
   * @returns {string | undefined} The labelmap imageId reference for the current imageId rendered on the viewport.
   */
  _updateLabelmapSegmentationReferences(
    segmentationId,
    stackViewport,
    labelmapImageIds,
    updateCallback
  ) {
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

    if (updateCallback) {
      updateCallback(stackViewport, segmentationId, labelmapImageIds);
    }

    return this._stackLabelmapImageIdReferenceMap
      .get(segmentationId)
      .get(currentImageId);
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
  private getLabelmapImageIds(representationData: RepresentationsData) {
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

  /**
   * Removes a segmentation representation from the state.
   * @param {string} viewportId - The ID of the viewport.
   * @param {string} segmentationId - The ID of the segmentation.
   * @param {SegmentationRepresentations} type - The type of segmentation representation.
   */
  removeSegmentationRepresentation(
    viewportId: string,
    segmentationId: string,
    type: SegmentationRepresentations
  ): void {
    const viewport = this.state.viewports[viewportId];

    if (!viewport) {
      return;
    }

    const viewportRendering = viewport.find(
      (segRep) =>
        segRep.segmentationId === segmentationId && segRep.type === type
    );

    if (!viewportRendering) {
      return;
    }

    viewport.splice(viewport.indexOf(viewportRendering), 1);
  }

  setActiveSegmentation(viewportId: string, segmentationId: string): void {
    const viewport = this.state.viewports[viewportId];

    if (!viewport) {
      return;
    }

    Object.entries(viewport).forEach(([key, value]) => {
      value.active = value.segmentationId === segmentationId;
    });
  }

  /**
   * Retrieves the active segmentation representation for a given viewport.
   * @param viewportId - The ID of the viewport.
   * @returns The active segmentation representation, or undefined if not found.
   */
  getActiveSegmentation(viewportId: string): Segmentation | undefined {
    if (!this.state.viewports[viewportId]) {
      return;
    }

    const activeSegRep = this.state.viewports[viewportId].find(
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
   * @returns The segmentation representations for the given viewport, or undefined if not found.
   */
  getSegmentationRepresentations(
    viewportId: string,
    specifier: {
      segmentationId?: string;
      type?: SegmentationRepresentations;
    } = {}
  ): SegmentationRepresentation[] | [] {
    const segmentationRepresentations = this.state.viewports[viewportId];

    if (!segmentationRepresentations) {
      return;
    }

    // If no specifier is provided, return all entries
    if (!specifier.type && !specifier.segmentationId) {
      return segmentationRepresentations;
    }

    return segmentationRepresentations.filter((representation) => {
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
   * Retrieves the visibility of a segmentation representation in a specific viewport.
   * @param viewportId - The ID of the viewport.
   * @param segmentationId - The ID of the segmentation.
   * @param type - The type of the segmentation representation.
   * @returns The visibility of the segmentation representation in the viewport.
   */
  getSegmentationRepresentationVisibility(
    viewportId: string,
    segmentationId: string,
    type: SegmentationRepresentations
  ): boolean {
    const viewportRepresentations = this.getSegmentationRepresentations(
      viewportId,
      {
        segmentationId,
        type,
      }
    );

    return viewportRepresentations?.[0]?.visible;
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
    segmentationId: string,
    type: SegmentationRepresentations,
    visible: boolean
  ): void {
    const viewportRepresentations = this.getSegmentationRepresentations(
      viewportId,
      {
        segmentationId,
        type,
      }
    );

    if (!viewportRepresentations) {
      return;
    }

    viewportRepresentations.forEach((representation) => {
      representation.visible = visible;
    });
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

async function internalComputeVolumeLabelmapFromStack({
  imageIds,
  options = {},
}: {
  imageIds: string[];
  options?: {
    volumeId?: string;
  };
}): Promise<{ volumeId: string }> {
  const segmentationImageIds = imageIds;

  const volumeId = options?.volumeId ?? csUtils.uuidv4();

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
      colorLUTIndex: 0,
    } as LabelmapRenderingConfig;
  } else {
    return {
      colorLUTIndex: 0,
    } as ContourRenderingConfig;
  }
}

const defaultSegmentationStateManager = new SegmentationStateManager('DEFAULT');
window.segs = defaultSegmentationStateManager.state;
export {
  internalConvertStackToVolumeLabelmap,
  internalComputeVolumeLabelmapFromStack,
  defaultSegmentationStateManager,
};
