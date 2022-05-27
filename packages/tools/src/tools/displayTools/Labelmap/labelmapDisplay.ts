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
 * @returns The UID of the new segementation representation
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

  const toolGroupSpecificRepresentation: ToolGroupSpecificRepresentation = {
    segmentationId,
    segmentationRepresentationUID,
    type: Representations.Labelmap,
    segmentsHidden,
    visibility,
    colorLUTIndex,
    active,
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
    const suppressEvents = true;
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
  const labelmapConfig =
    toolGroupConfig.representations[Representations.Labelmap];
  const renderInactiveSegmentations =
    toolGroupConfig.renderInactiveSegmentations;

  _setLabelmapColorAndOpacity(
    viewport.id,
    actorEntry,
    cfun,
    ofun,
    colorLUTIndex,
    labelmapConfig,
    active,
    renderInactiveSegmentations,
    visibility
  );
}

function _setLabelmapColorAndOpacity(
  viewportId: string,
  actorEntry: Types.ActorEntry,
  cfun: vtkColorTransferFunction,
  ofun: vtkPiecewiseFunction,
  colorLUTIndex: number,
  labelmapConfig: LabelmapConfig,
  isActiveLabelmap: boolean,
  renderInactiveSegmentations: boolean,
  visibility = true
): void {
  ofun.addPoint(0, 0);

  const fillAlpha = isActiveLabelmap
    ? labelmapConfig.fillAlpha
    : labelmapConfig.fillAlphaInactive;
  const outlineWidth = isActiveLabelmap
    ? labelmapConfig.outlineWidthActive
    : labelmapConfig.outlineWidthInactive;

  const renderFill = isActiveLabelmap
    ? labelmapConfig.renderFill
    : labelmapConfig.renderFillInactive;

  // Note: MAX_NUMBER_COLORS = 256 is needed because the current method to generate
  // the default color table uses RGB.

  const colorLUT = SegmentationState.getColorLUT(colorLUTIndex);
  const numColors = Math.min(256, colorLUT.length);
  const { uid } = actorEntry;
  const volumeActor = actorEntry.actor as Types.VolumeActor;

  const { needColorUpdate, needOpacityUpdate } = _needsTransferFunctionUpdate(
    viewportId,
    uid,
    fillAlpha,
    colorLUTIndex,
    renderFill
  );

  if (needColorUpdate) {
    for (let i = 0; i < numColors; i++) {
      const color = colorLUT[i];
      cfun.addRGBPoint(
        i,
        color[0] / MAX_NUMBER_COLORS,
        color[1] / MAX_NUMBER_COLORS,
        color[2] / MAX_NUMBER_COLORS
      );
    }
    volumeActor.getProperty().setRGBTransferFunction(0, cfun);
  }

  if (needOpacityUpdate) {
    if (labelmapConfig.renderFill) {
      for (let i = 0; i < numColors; i++) {
        const color = colorLUT[i];

        // Set the opacity per label.
        const segmentOpacity = (color[3] / 255) * fillAlpha;
        ofun.addPoint(i, segmentOpacity);
      }
    } else {
      for (let i = 0; i < numColors; i++) {
        // TODO -> This at least gives the correct visual effect for now.
        // But if we set all values to 0 the outline doesn't render
        ofun.addPoint(i, 0.01);
      }
    }

    ofun.setClamping(false);
    volumeActor.getProperty().setScalarOpacity(0, ofun);
  }

  volumeActor.getProperty().setInterpolationTypeToNearest();

  volumeActor.getProperty().setUseLabelOutline(labelmapConfig.renderOutline);
  volumeActor.getProperty().setLabelOutlineThickness(outlineWidth);

  // Set visibility based on whether actor visibility is specifically asked
  // to be turned on/off (on by default) AND whether is is in active but
  // we are rendering inactive labelmap
  const visible =
    visibility && (isActiveLabelmap || renderInactiveSegmentations);
  volumeActor.setVisibility(visible);
}

function _needsTransferFunctionUpdate(
  viewportId: string,
  actorUID: string,
  fillAlpha: number,
  colorLUTIndex: number,
  renderFill: boolean
) {
  const cacheUID = `${viewportId}-${actorUID}`;
  const config = labelMapConfigCache.get(cacheUID);

  let needColorUpdate = false;
  let needOpacityUpdate = false;

  labelMapConfigCache.set(cacheUID, {
    fillAlpha,
    colorLUTIndex,
  });

  if (!config) {
    needColorUpdate = true;
    needOpacityUpdate = true;
  }

  if (config && config.fillAlpha !== fillAlpha) {
    needOpacityUpdate = true;
  }

  if (config && config.colorLUTIndex !== colorLUTIndex) {
    needColorUpdate = true;
  }

  if (config && config.renderFill !== renderFill) {
    needOpacityUpdate = true;
  }

  return { needColorUpdate, needOpacityUpdate };
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
