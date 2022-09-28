import vtkColorTransferFunction from '@kitware/vtk.js/Rendering/Core/ColorTransferFunction';
import vtkPiecewiseFunction from '@kitware/vtk.js/Common/DataModel/PiecewiseFunction';

import {
  cache,
  getEnabledElementByIds,
  Types,
  utilities,
} from '@cornerstonejs/core';

import * as SegmentationState from '../../../stateManagement/segmentation/segmentationState';
import * as SegmentationConfig from '../../../stateManagement/segmentation/config/segmentationConfig';
import Representations from '../../../enums/SegmentationRepresentations';
import { getToolGroup } from '../../../store/ToolGroupManager';
import type { LabelmapConfig } from '../../../types/LabelmapTypes';
import {
  RepresentationPublicInput,
  SegmentationRepresentationConfig,
  ToolGroupSpecificRepresentation,
} from '../../../types/SegmentationStateTypes';

import addLabelmapToElement from './addLabelmapToElement';

import { deepMerge } from '../../../utilities';
import { IToolGroup } from '../../../types';
import removeLabelmapFromElement from './removeLabelmapFromElement';

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
  const segmentation = SegmentationState.getSegmentation(segmentationId);
  const { volumeId } =
    segmentation.representationData[Representations.Labelmap];
  const segmentationRepresentationUID = utilities.uuidv4();

  // only add the labelmap to ToolGroup viewports if it is not already added
  await _addLabelmapToToolGroupViewports(
    toolGroupId,
    volumeId,
    segmentationRepresentationUID
  );

  // Todo: make these configurable during representation input by user
  const segmentsHidden = new Set() as Set<number>;
  const visibility = true;
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
    visibility,
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

    const mergedConfig = deepMerge(
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
 */
function removeSegmentationRepresentation(
  toolGroupId: string,
  segmentationRepresentationUID: string
): void {
  _removeLabelmapFromToolGroupViewports(
    toolGroupId,
    segmentationRepresentationUID
  );
  SegmentationState.removeSegmentationRepresentation(
    toolGroupId,
    segmentationRepresentationUID
  );
}

/**
 * It takes the enabled element, the segmentation Id, and the configuration, and
 * it sets the segmentation for the enabled element as a labelmap
 * @param enabledElement - The cornerstone enabled element
 * @param segmentationId - The id of the segmentation to be rendered.
 * @param configuration - The configuration object for the labelmap.
 */
function render(
  viewport: Types.IViewport,
  representation: ToolGroupSpecificRepresentation,
  toolGroupConfig: SegmentationRepresentationConfig
): void {
  const {
    colorLUTIndex,
    active,
    segmentationId,
    segmentationRepresentationUID,
    visibility,
    segmentsHidden,
    config: renderingConfig,
  } = representation;

  const segmentation = SegmentationState.getSegmentation(segmentationId);
  const labelmapData =
    segmentation.representationData[Representations.Labelmap];
  const { volumeId: labelmapUID } = labelmapData;

  const labelmap = cache.getVolume(labelmapUID);

  if (!labelmap) {
    throw new Error(`No Labelmap found for volumeId: ${labelmapUID}`);
  }

  const actorEntry = viewport.getActor(segmentationRepresentationUID);
  if (!actorEntry) {
    console.warn(
      'No actor found for actorUID: ',
      segmentationRepresentationUID
    );
    return;
  }

  const { cfun, ofun } = renderingConfig;

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
    segmentsHidden,
    visibility
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
  segmentsHidden: Set<number>,
  visibility = true
): void {
  const { segmentSpecificConfig, segmentationRepresentationSpecificConfig } =
    segmentationRepresentation;

  const segmentationRepresentationLabelmapConfig =
    segmentationRepresentationSpecificConfig[Representations.Labelmap];

  // Note: MAX_NUMBER_COLORS = 256 is needed because the current method to generate
  // the default color table uses RGB.
  const colorLUT = SegmentationState.getColorLUT(colorLUTIndex);
  const numColors = Math.min(256, colorLUT.length);
  const volumeActor = actorEntry.actor as Types.VolumeActor;
  const { uid: actorUID } = actorEntry;

  // Note: right now outlineWidth and renderOutline are not configurable
  // at the segment level, so we don't need to check for segment specific
  // configuration in the loop, Todo: make them configurable at the segment level
  const { outlineWidth, renderOutline } = _getLabelmapConfig(
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

      volumeActor.getProperty().setRGBTransferFunction(0, cfun);
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

      ofun.setClamping(false);
      volumeActor.getProperty().setScalarOpacity(0, ofun);
    }
  }

  volumeActor.getProperty().setInterpolationTypeToNearest();

  volumeActor.getProperty().setUseLabelOutline(renderOutline);
  volumeActor.getProperty().setLabelOutlineThickness(outlineWidth);

  // Set visibility based on whether actor visibility is specifically asked
  // to be turned on/off (on by default) AND whether is is in active but
  // we are rendering inactive labelmap
  const visible =
    visibility && (isActiveLabelmap || renderInactiveSegmentations);
  volumeActor.setVisibility(visible);
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

  return {
    fillAlpha,
    outlineWidth,
    renderFill,
    renderOutline,
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
      segmentsHidden,
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
    oldSegmentsHidden !== segmentsHidden;

  // update the cache
  labelMapConfigCache.set(cacheUID, {
    fillAlpha,
    renderFill,
    renderOutline,
    outlineWidth,
    segmentColor,
    segmentsHidden,
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

async function _addLabelmapToToolGroupViewports(
  toolGroupId: string,
  volumeId: string,
  segmentationRepresentationUID: string
): Promise<void> {
  const toolGroup = getToolGroup(toolGroupId) as IToolGroup;
  const { viewportsInfo } = toolGroup;

  for (const viewportInfo of viewportsInfo) {
    const { viewportId, renderingEngineId } = viewportInfo;
    const enabledElement = getEnabledElementByIds(
      viewportId,
      renderingEngineId
    );

    if (!enabledElement) {
      throw new Error(
        `No enabled element found for rendering engine: ${renderingEngineId} and viewport: ${viewportId}`
      );
    }

    const { viewport } = enabledElement;
    addLabelmapToElement(
      viewport.element,
      volumeId,
      segmentationRepresentationUID
    );
  }
}

export default {
  render,
  addSegmentationRepresentation,
  removeSegmentationRepresentation,
};
