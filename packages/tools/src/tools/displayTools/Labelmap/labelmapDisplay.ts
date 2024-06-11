import vtkPiecewiseFunction from '@kitware/vtk.js/Common/DataModel/PiecewiseFunction';
import vtkColorTransferFunction from '@kitware/vtk.js/Rendering/Core/ColorTransferFunction';

import {
  cache,
  getEnabledElementByIds,
  StackViewport,
  Types,
  VolumeViewport,
} from '@cornerstonejs/core';

import Representations from '../../../enums/SegmentationRepresentations';
import * as SegmentationState from '../../../stateManagement/segmentation/segmentationState';
import { getToolGroup } from '../../../store/ToolGroupManager';
import type {
  LabelmapConfig,
  LabelmapRenderingConfig,
  LabelmapSegmentationData,
} from '../../../types/LabelmapTypes';
import {
  SegmentationRepresentationConfig,
  ToolGroupSpecificRepresentation,
} from '../../../types/SegmentationStateTypes';

import addLabelmapToElement from './addLabelmapToElement';
import removeLabelmapFromElement from './removeLabelmapFromElement';
import { isVolumeSegmentation } from '../../segmentation/strategies/utils/stackVolumeCheck';
import { polySeg } from '../../../stateManagement/segmentation';

const MAX_NUMBER_COLORS = 255;
const labelMapConfigCache = new Map();

function getRepresentationRenderingConfig() {
  const cfun = vtkColorTransferFunction.newInstance();
  const ofun = vtkPiecewiseFunction.newInstance();
  ofun.addPoint(0, 0);
  return {
    ofun,
    cfun,
  };
}

let polySegConversionInProgress = false;

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

  if (!segmentation) {
    console.warn('No segmentation found for segmentationId: ', segmentationId);
    return;
  }

  let labelmapData = segmentation.representationData[Representations.Labelmap];

  let actorEntry = viewport.getActor(segmentationRepresentationUID);

  if (
    !labelmapData &&
    polySeg.canComputeRequestedRepresentation(segmentationRepresentationUID) &&
    !polySegConversionInProgress
  ) {
    // meaning the requested segmentation representationUID does not have
    // labelmap data, BUT we might be able to request a conversion from
    // another representation to labelmap
    // we need to check if we can request polySEG to convert the other
    // underlying representations to Surface
    polySegConversionInProgress = true;

    labelmapData = await polySeg.computeAndAddLabelmapRepresentation(
      segmentationId,
      {
        segmentationRepresentationUID,
        viewport,
      }
    );

    if (!labelmapData) {
      throw new Error(
        `No labelmap data found for segmentationId ${segmentationId}.`
      );
    }

    polySegConversionInProgress = false;
  }

  if (!labelmapData) {
    return;
  }

  if (isVolumeSegmentation(labelmapData, viewport)) {
    if (viewport instanceof StackViewport) {
      return;
    }

    const { volumeId: labelmapUID } = labelmapData;

    const labelmap = cache.getVolume(labelmapUID);

    if (!labelmap) {
      throw new Error(`No Labelmap found for volumeId: ${labelmapUID}`);
    }

    if (!isSameFrameOfReference(viewport, labelmapData?.referencedVolumeId)) {
      return;
    }

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
    if (viewport instanceof VolumeViewport) {
      return;
    }

    // stack segmentation
    const imageId = viewport.getCurrentImageId();
    const { imageIdReferenceMap } = labelmapData;

    // if the stack labelmap is not built for the current imageId that is
    // rendered at the viewport then return
    if (!imageIdReferenceMap.has(imageId)) {
      return;
    }

    if (!actorEntry) {
      // only add the labelmap to ToolGroup viewports if it is not already added
      await _addLabelmapToViewport(
        viewport,
        labelmapData,
        segmentationRepresentationUID
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
  const { uid: actorUID } = actorEntry;

  // Note: right now outlineWidth and renderOutline are not configurable
  // at the segment level, so we don't need to check for segment specific
  // configuration in the loop, Todo: make them configurable at the segment level
  const { outlineWidth, renderOutline, outlineOpacity } = _getLabelmapConfig(
    toolGroupLabelmapConfig,
    segmentationRepresentationLabelmapConfig,
    isActiveLabelmap
  );

  // Todo: the below loop probably can be optimized so that we don't hit it
  // unless a config has changed. Right now we get into the following loop
  // even for brush drawing which does not makes sense
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

  const actor = actorEntry.actor as Types.VolumeActor;

  actor.getProperty().setRGBTransferFunction(0, cfun);

  ofun.setClamping(false);

  actor.getProperty().setScalarOpacity(0, ofun);
  actor.getProperty().setInterpolationTypeToNearest();
  actor.getProperty().setUseLabelOutline(renderOutline);

  // @ts-ignore - fix type in vtk
  actor.getProperty().setLabelOutlineOpacity(outlineOpacity);

  const { activeSegmentIndex } = SegmentationState.getSegmentation(
    segmentationRepresentation.segmentationId
  );

  // create an array that contains all the segment indices and for the active
  // segment index, use the activeSegmentOutlineWidthDelta, otherwise use the
  // outlineWidth
  // Pre-allocate the array with the required size to avoid dynamic resizing.
  const outlineWidths = new Array(numColors - 1);

  for (let i = 1; i < numColors; i++) {
    // Start from 1 to skip the background segment index.
    const isHidden = segmentsHidden.has(i);

    if (isHidden) {
      outlineWidths[i - 1] = 0;
      continue;
    }

    outlineWidths[i - 1] =
      i === activeSegmentIndex
        ? outlineWidth + toolGroupLabelmapConfig.activeSegmentOutlineWidthDelta
        : outlineWidth;
  }

  actor.getProperty().setLabelOutlineThickness(outlineWidths);

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
      segmentColor: segmentColor.slice(), // Create a copy
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
  labelmapData: LabelmapSegmentationData,
  segmentationRepresentationUID
): Promise<void> {
  await addLabelmapToElement(
    viewport.element,
    labelmapData,
    segmentationRepresentationUID
  );
}

export default {
  getRepresentationRenderingConfig,
  render,
  removeSegmentationRepresentation,
};

export {
  getRepresentationRenderingConfig,
  render,
  removeSegmentationRepresentation,
};
