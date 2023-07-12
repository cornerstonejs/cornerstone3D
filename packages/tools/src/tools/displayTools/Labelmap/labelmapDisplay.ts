import vtkPiecewiseFunction from '@kitware/vtk.js/Common/DataModel/PiecewiseFunction';
import vtkColorTransferFunction from '@kitware/vtk.js/Rendering/Core/ColorTransferFunction';

import {
  cache,
  getEnabledElementByIds,
  Types,
  utilities,
  Enums,
  getEnabledElement,
} from '@cornerstonejs/core';

import { SegmentationRepresentations } from '../../../enums';
import Representations from '../../../enums/SegmentationRepresentations';
import * as SegmentationConfig from '../../../stateManagement/segmentation/config/segmentationConfig';
import * as SegmentationState from '../../../stateManagement/segmentation/segmentationState';
import {
  getToolGroup,
  getToolGroupForViewport,
} from '../../../store/ToolGroupManager';
import type {
  LabelmapConfig,
  LabelmapRenderingConfig,
  LabelmapSegmentationData,
} from '../../../types/LabelmapTypes';
import {
  RepresentationPublicInput,
  SegmentationRepresentationConfig,
  ToolGroupSpecificRepresentation,
} from '../../../types/SegmentationStateTypes';

import addLabelmapToElement from './addLabelmapToElement';

import removeLabelmapFromElement from './removeLabelmapFromElement';
import vtkActor from '@kitware/vtk.js/Rendering/Core/Actor';
import { updateVTKImageDataFromImageId } from '../../../../../core/src/RenderingEngine/helpers/updateVTKImageDataFromImage';
const MAX_NUMBER_COLORS = 255;
const labelMapConfigCache = new Map();

/**
 * For each viewport, in the toolGroup it adds the segmentation labelmap
 * representation to its viewports.
 * @param toolGroup - the tool group that contains the viewports
 * @param representationInput - The segmentation representation input
 * @param toolGroupSpecificConfig - The configuration object for toolGroup
 *
 * @returns The UID of the new segmentation representation
 */
async function addSegmentationRepresentation(
  toolGroupId: string,
  representationInput: RepresentationPublicInput,
  toolGroupSpecificConfig?: SegmentationRepresentationConfig
): Promise<string> {
  const { segmentationId } = representationInput;
  const segmentationRepresentationUID = utilities.uuidv4();

  // Todo: make these configurable during representation input by user
  const segmentsHidden = new Set() as Set<number>;
  const colorLUTIndex = 0;
  const active = true;
  const cfun = vtkColorTransferFunction.newInstance();
  const ofun = vtkPiecewiseFunction.newInstance();

  ofun.addPoint(0, 0);

  const toolGroupSpecificRepresentation: ToolGroupSpecificRepresentation = {
    segmentationId,
    segmentationRepresentationUID,
    type: Representations.Labelmap,
    segmentsHidden,
    colorLUTIndex,
    active,
    segmentationRepresentationSpecificConfig: {},
    segmentSpecificConfig: {},
    config: {
      cfun,
      ofun,
    },
  };

  // Update the toolGroup specific configuration
  if (toolGroupSpecificConfig) {
    // Since setting configuration on toolGroup will trigger a segmentationRepresentation
    // update event, we don't want to trigger the event twice, so we suppress
    // the first one
    const currentToolGroupConfig =
      SegmentationConfig.getToolGroupSpecificConfig(toolGroupId);

    const mergedConfig = utilities.deepMerge(
      currentToolGroupConfig,
      toolGroupSpecificConfig
    );

    SegmentationConfig.setToolGroupSpecificConfig(toolGroupId, {
      renderInactiveSegmentations:
        mergedConfig.renderInactiveSegmentations || true,
      representations: {
        ...mergedConfig.representations,
      },
    });
  }

  SegmentationState.addSegmentationRepresentation(
    toolGroupId,
    toolGroupSpecificRepresentation
  );

  return segmentationRepresentationUID;
}

/**
 * For each viewport, and for each segmentation, set the segmentation for the viewport's enabled element
 * Initializes the global and viewport specific state for the segmentation in the
 * SegmentationStateManager.
 * @param toolGroup - the tool group that contains the viewports
 * @param segmentationRepresentationUID - The uid of the segmentation representation
 * @param renderImmediate - If true, there will be a render call after the labelmap is removed
 */
function removeSegmentationRepresentation(
  toolGroupId: string,
  segmentationRepresentationUID: string,
  renderImmediate = false
): void {
  _removeLabelmapFromToolGroupViewports(
    toolGroupId,
    segmentationRepresentationUID
  );
  SegmentationState.removeSegmentationRepresentation(
    toolGroupId,
    segmentationRepresentationUID
  );

  if (renderImmediate) {
    const viewportsInfo = getToolGroup(toolGroupId).getViewportsInfo();
    viewportsInfo.forEach(({ viewportId, renderingEngineId }) => {
      const enabledElement = getEnabledElementByIds(
        viewportId,
        renderingEngineId
      );
      enabledElement.viewport.render();
    });
  }
}

/**
 * Checks if a segmentation data have the same frameOfReference as the series
 * displayed in a given viewport
 * @param viewport
 * @param referencedVolumeId volume id of the segmentation reference series
 * @returns
 */
function isSameFrameOfReference(viewport, referencedVolumeId) {
  // if the referencedVolumeId is not defined, we acted as before to not break
  // applications as referencedVolumeId is inserted in this change
  // Can modify that in the future commits
  if (!referencedVolumeId) {
    return true;
  }
  const defaultActor = viewport.getDefaultActor();
  if (!defaultActor) {
    return false;
  }
  const { uid: defaultActorUID } = defaultActor;
  const volume = cache.getVolume(defaultActorUID);

  if (volume) {
    const referencedVolume = cache.getVolume(referencedVolumeId);
    if (
      referencedVolume &&
      volume.metadata.FrameOfReferenceUID ===
        referencedVolume.metadata.FrameOfReferenceUID
    ) {
      return true;
    }
  }
  return false;
}

function getLabelmapStackRepresentationUIDsFromToolGroup(
  toolGroupID: string
): Array<string> {
  const toolGroupSegmentationRepresentations =
    SegmentationState.getSegmentationRepresentations(toolGroupID);
  const segmentationRepresentations = [];
  toolGroupSegmentationRepresentations.forEach((representation) => {
    if (representation.type === SegmentationRepresentations.Labelmap) {
      const segmentation = SegmentationState.getSegmentation(
        representation.segmentationId
      );
      const labelmapData =
        segmentation.representationData[Representations.Labelmap];
      if (labelmapData?.type === 'stack') {
        segmentationRepresentations.push(
          representation.segmentationRepresentationUID
        );
      }
    }
  });
  return segmentationRepresentations;
}

function updateSegmentationImage(evt) {
  const eventData = evt.detail;
  const { element } = eventData;
  const { viewport, viewportId, renderingEngineId } =
    getEnabledElement(element);
  const toolGroup = getToolGroupForViewport(viewportId, renderingEngineId);
  const segmentationRepresentations =
    getLabelmapStackRepresentationUIDsFromToolGroup(toolGroup.id);

  const imageId = viewport.getCurrentImageId();
  const actors = viewport.getActors();
  actors.forEach((actor) => {
    if (segmentationRepresentations.includes(actor.uid)) {
      updateVTKImageDataFromImageId(
        imageId,
        actor.actor.getMapper().getInputData()
      );
    }
  });
}

/**
 * It takes the enabled element, the segmentation Id, and the configuration, and
 * it sets the segmentation for the enabled element as a labelmap
 * @param enabledElement - The cornerstone enabled element
 * @param segmentationId - The id of the segmentation to be rendered.
 * @param configuration - The configuration object for the labelmap.
 */
async function render(
  viewport: Types.IVolumeViewport | Types.IStackViewport,
  representation: ToolGroupSpecificRepresentation,
  toolGroupConfig: SegmentationRepresentationConfig
): Promise<void> {
  const {
    colorLUTIndex,
    active,
    segmentationId,
    segmentationRepresentationUID,
    segmentsHidden,
    config: renderingConfig,
  } = representation;

  const segmentation = SegmentationState.getSegmentation(segmentationId);
  const labelmapData =
    segmentation.representationData[Representations.Labelmap];

  let actorEntry;
  if (labelmapData.type === 'volume') {
    const { volumeId: labelmapUID } = labelmapData;

    const labelmap = cache.getVolume(labelmapUID);

    if (!labelmap) {
      throw new Error(`No Labelmap found for volumeId: ${labelmapUID}`);
    }

    if (!isSameFrameOfReference(viewport, labelmapData?.referencedVolumeId)) {
      return;
    }
    actorEntry = viewport.getActor(segmentationRepresentationUID);

    if (!actorEntry) {
      // only add the labelmap to ToolGroup viewports if it is not already added
      await _addLabelmapToViewport(
        viewport,
        labelmapData,
        segmentationRepresentationUID
      );
    }

    actorEntry = viewport.getActor(segmentationRepresentationUID);
  } else {
    const imageId = viewport.getCurrentImageId();
    const { referencedImageIds } = labelmapData;
    if (referencedImageIds.includes(imageId)) {
      actorEntry = viewport.getActor(segmentationRepresentationUID);
      if (!actorEntry) {
        // only add the labelmap to ToolGroup viewports if it is not already added
        await _addLabelmapToViewport(
          viewport,
          labelmapData,
          segmentationRepresentationUID
        );
      }

      viewport.element.removeEventListener(
        Enums.Events.IMAGE_RENDERED,
        updateSegmentationImage
      );
      viewport.element.addEventListener(
        Enums.Events.IMAGE_RENDERED,
        updateSegmentationImage
      );
    }
    actorEntry = viewport.getActor(segmentationRepresentationUID);
  }

  if (!actorEntry) {
    return;
  }

  const { cfun, ofun } = renderingConfig as LabelmapRenderingConfig;

  const renderInactiveSegmentations =
    toolGroupConfig.renderInactiveSegmentations;

  _setLabelmapColorAndOpacity(
    viewport.id,
    actorEntry,
    cfun,
    ofun,
    colorLUTIndex,
    toolGroupConfig.representations[Representations.Labelmap],
    representation,
    active,
    renderInactiveSegmentations,
    segmentsHidden
  );
}

function _setLabelmapColorAndOpacity(
  viewportId: string,
  actorEntry: Types.ActorEntry,
  cfun: vtkColorTransferFunction,
  ofun: vtkPiecewiseFunction,
  colorLUTIndex: number,
  toolGroupLabelmapConfig: LabelmapConfig,
  segmentationRepresentation: ToolGroupSpecificRepresentation,
  isActiveLabelmap: boolean,
  renderInactiveSegmentations: boolean,
  segmentsHidden: Set<number>
): void {
  const { segmentSpecificConfig, segmentationRepresentationSpecificConfig } =
    segmentationRepresentation;

  const segmentationRepresentationLabelmapConfig =
    segmentationRepresentationSpecificConfig[Representations.Labelmap];

  // Note: MAX_NUMBER_COLORS = 256 is needed because the current method to generate
  // the default color table uses RGB.
  const colorLUT = SegmentationState.getColorLUT(colorLUTIndex);
  const numColors = Math.min(256, colorLUT.length);
  const actor = actorEntry.actor as vtkActor;
  const { uid: actorUID } = actorEntry;

  // Note: right now outlineWidth and renderOutline are not configurable
  // at the segment level, so we don't need to check for segment specific
  // configuration in the loop, Todo: make them configurable at the segment level
  const { outlineWidth, renderOutline, outlineOpacity } = _getLabelmapConfig(
    toolGroupLabelmapConfig,
    segmentationRepresentationLabelmapConfig,
    isActiveLabelmap
  );

  for (let i = 0; i < numColors; i++) {
    const segmentIndex = i;
    const segmentColor = colorLUT[segmentIndex];

    const segmentSpecificLabelmapConfig =
      segmentSpecificConfig[segmentIndex]?.[Representations.Labelmap];

    const { fillAlpha, outlineWidth, renderFill, renderOutline } =
      _getLabelmapConfig(
        toolGroupLabelmapConfig,
        segmentationRepresentationLabelmapConfig,
        isActiveLabelmap,
        segmentSpecificLabelmapConfig
      );

    const { forceOpacityUpdate, forceColorUpdate } =
      _needsTransferFunctionUpdate(viewportId, actorUID, segmentIndex, {
        fillAlpha,
        renderFill,
        renderOutline,
        segmentColor,
        outlineWidth,
        segmentsHidden,
      });

    if (forceColorUpdate) {
      cfun.addRGBPoint(
        segmentIndex,
        segmentColor[0] / MAX_NUMBER_COLORS,
        segmentColor[1] / MAX_NUMBER_COLORS,
        segmentColor[2] / MAX_NUMBER_COLORS
      );
    }

    if (forceOpacityUpdate) {
      if (renderFill) {
        const segmentOpacity = segmentsHidden.has(segmentIndex)
          ? 0
          : (segmentColor[3] / 255) * fillAlpha;

        ofun.removePoint(segmentIndex);
        ofun.addPointLong(segmentIndex, segmentOpacity, 0.5, 1.0);
      } else {
        ofun.addPointLong(segmentIndex, 0.01, 0.5, 1.0);
      }
    }
  }

  actor.getProperty().setRGBTransferFunction(0, cfun);

  ofun.setClamping(false);
  actor.getProperty().setScalarOpacity(0, ofun);

  actor.getProperty().setInterpolationTypeToNearest();

  if (utilities.actorIsA(actorEntry, 'vtkVolume')) {
    actor.getProperty().setUseLabelOutline(renderOutline);

    // @ts-ignore: setLabelOutlineWidth is not in the vtk.d.ts apparently
    actor.getProperty().setLabelOutlineOpacity(outlineOpacity);
    actor.getProperty().setLabelOutlineThickness(outlineWidth);
  }

  // Set visibility based on whether actor visibility is specifically asked
  // to be turned on/off (on by default) AND whether is is in active but
  // we are rendering inactive labelmap
  const visible = isActiveLabelmap || renderInactiveSegmentations;
  actor.setVisibility(visible);
}

function _getLabelmapConfig(
  toolGroupLabelmapConfig: LabelmapConfig,
  segmentationRepresentationLabelmapConfig: LabelmapConfig,
  isActiveLabelmap: boolean,
  segmentsLabelmapConfig?: LabelmapConfig
) {
  const segmentLabelmapConfig = segmentsLabelmapConfig || {};

  const configToUse = {
    ...toolGroupLabelmapConfig,
    ...segmentationRepresentationLabelmapConfig,
    ...segmentLabelmapConfig,
  };

  const fillAlpha = isActiveLabelmap
    ? configToUse.fillAlpha
    : configToUse.fillAlphaInactive;
  const outlineWidth = isActiveLabelmap
    ? configToUse.outlineWidthActive
    : configToUse.outlineWidthInactive;

  const renderFill = isActiveLabelmap
    ? configToUse.renderFill
    : configToUse.renderFillInactive;

  const renderOutline = configToUse.renderOutline;

  const outlineOpacity = isActiveLabelmap
    ? configToUse.outlineOpacity
    : configToUse.outlineOpacityInactive;

  return {
    fillAlpha,
    outlineWidth,
    renderFill,
    renderOutline,
    outlineOpacity,
  };
}

function _needsTransferFunctionUpdate(
  viewportId: string,
  actorUID: string,
  segmentIndex: number,
  {
    fillAlpha,
    renderFill,
    renderOutline,
    segmentColor,
    outlineWidth,
    segmentsHidden,
  }: {
    fillAlpha: number;
    renderFill: boolean;
    renderOutline: boolean;
    outlineWidth: number;
    segmentColor: number[];
    segmentsHidden: Set<number>;
  }
) {
  const cacheUID = `${viewportId}-${actorUID}-${segmentIndex}`;
  const oldConfig = labelMapConfigCache.get(cacheUID);

  if (!oldConfig) {
    labelMapConfigCache.set(cacheUID, {
      fillAlpha,
      renderFill,
      renderOutline,
      outlineWidth,
      segmentColor,
      segmentsHidden: new Set(segmentsHidden), // Create a copy
    });

    return {
      forceOpacityUpdate: true,
      forceColorUpdate: true,
    };
  }

  const {
    fillAlpha: oldFillAlpha,
    renderFill: oldRenderFill,
    renderOutline: oldRenderOutline,
    outlineWidth: oldOutlineWidth,
    segmentColor: oldSegmentColor,
    segmentsHidden: oldSegmentsHidden,
  } = oldConfig;

  const forceColorUpdate =
    oldSegmentColor[0] !== segmentColor[0] ||
    oldSegmentColor[1] !== segmentColor[1] ||
    oldSegmentColor[2] !== segmentColor[2];

  const forceOpacityUpdate =
    oldSegmentColor[3] !== segmentColor[3] ||
    oldFillAlpha !== fillAlpha ||
    oldRenderFill !== renderFill ||
    oldRenderOutline !== renderOutline ||
    oldOutlineWidth !== outlineWidth ||
    oldSegmentsHidden.has(segmentIndex) !== segmentsHidden.has(segmentIndex);

  // update the cache
  labelMapConfigCache.set(cacheUID, {
    fillAlpha,
    renderFill,
    renderOutline,
    outlineWidth,
    segmentColor: segmentColor.slice(), // Create a copy
    segmentsHidden: new Set(segmentsHidden), // Create a copy
  });

  return {
    forceOpacityUpdate,
    forceColorUpdate,
  };
}

function _removeLabelmapFromToolGroupViewports(
  toolGroupId: string,
  segmentationRepresentationUID: string
): void {
  const toolGroup = getToolGroup(toolGroupId);

  if (toolGroup === undefined) {
    throw new Error(`ToolGroup with ToolGroupId ${toolGroupId} does not exist`);
  }

  const { viewportsInfo } = toolGroup;

  for (const viewportInfo of viewportsInfo) {
    const { viewportId, renderingEngineId } = viewportInfo;
    const enabledElement = getEnabledElementByIds(
      viewportId,
      renderingEngineId
    );
    removeLabelmapFromElement(
      enabledElement.viewport.element,
      segmentationRepresentationUID
    );
  }
}

async function _addLabelmapToViewport(
  viewport: Types.IVolumeViewport | Types.IStackViewport,
  labelmap: LabelmapSegmentationData,
  segmentationRepresentationUID: string
): Promise<void> {
  await addLabelmapToElement(
    viewport.element,
    labelmap,
    segmentationRepresentationUID
  );
}

export default {
  render,
  addSegmentationRepresentation,
  removeSegmentationRepresentation,
};
