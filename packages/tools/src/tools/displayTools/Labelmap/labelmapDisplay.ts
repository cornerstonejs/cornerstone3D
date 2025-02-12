import type { Types } from '@cornerstonejs/core';
import {
  getEnabledElementByViewportId,
  VolumeViewport,
} from '@cornerstonejs/core';

import type {
  LabelmapSegmentationData,
  LabelmapStyle,
} from '../../../types/LabelmapTypes';
import type {
  LabelmapRenderingConfig,
  LabelmapRepresentation,
  SegmentationRepresentation,
} from '../../../types/SegmentationStateTypes';

import addLabelmapToElement from './addLabelmapToElement';
import removeLabelmapFromElement from './removeLabelmapFromElement';
import { getActiveSegmentation } from '../../../stateManagement/segmentation/activeSegmentation';
import { getColorLUT } from '../../../stateManagement/segmentation/getColorLUT';
import { getCurrentLabelmapImageIdForViewportOverlapping } from '../../../stateManagement/segmentation/getCurrentLabelmapImageIdForViewport';
import { getSegmentation } from '../../../stateManagement/segmentation/getSegmentation';
import { canComputeRequestedRepresentation } from '../../../stateManagement/segmentation/polySeg/canComputeRequestedRepresentation';
import { computeAndAddLabelmapRepresentation } from '../../../stateManagement/segmentation/polySeg/Labelmap/computeAndAddLabelmapRepresentation';
import type vtkColorTransferFunction from '@kitware/vtk.js/Rendering/Core/ColorTransferFunction';
import type vtkPiecewiseFunction from '@kitware/vtk.js/Common/DataModel/PiecewiseFunction';
import { segmentationStyle } from '../../../stateManagement/segmentation/SegmentationStyle';
import SegmentationRepresentations from '../../../enums/SegmentationRepresentations';
import { internalGetHiddenSegmentIndices } from '../../../stateManagement/segmentation/helpers/internalGetHiddenSegmentIndices';
import { getActiveSegmentIndex } from '../../../stateManagement/segmentation/getActiveSegmentIndex';
import type vtkVolume from '@kitware/vtk.js/Rendering/Core/Volume';
import { getLabelmapActorEntries } from '../../../stateManagement/segmentation/helpers/getSegmentationActor';

// 255 itself is used as preview color, so basically
// we have 254 colors to use for the segments if we are using the preview.
export const MAX_NUMBER_COLORS = 255;
const labelMapConfigCache = new Map();

let polySegConversionInProgress = false;

/**
 * For each viewport, and for each segmentation, set the segmentation for the viewport's enabled element
 * Initializes the global and viewport specific state for the segmentation in the
 * SegmentationStateManager.
 * @param toolGroup - the tool group that contains the viewports
 * @param segmentationId - The id of the segmentation
 * @param renderImmediate - If true, there will be a render call after the labelmap is removed
 */
function removeRepresentation(
  viewportId: string,
  segmentationId: string,
  renderImmediate = false
): void {
  const enabledElement = getEnabledElementByViewportId(viewportId);
  // Clean up the cache for this segmentation

  labelMapConfigCache.forEach((value, key) => {
    if (key.includes(segmentationId)) {
      labelMapConfigCache.delete(key);
    }
  });

  if (!enabledElement) {
    return;
  }

  const { viewport } = enabledElement;

  removeLabelmapFromElement(viewport.element, segmentationId);

  if (!renderImmediate) {
    return;
  }

  viewport.render();
}

/**
 * It takes the enabled element, the segmentation Id, and the configuration, and
 * it sets the segmentation for the enabled element as a labelmap
 * @param enabledElement - The cornerstone enabled element
 * @param segmentationId - The id of the segmentation to be rendered.
 * @param configuration - The configuration object for the labelmap.
 */
async function render(
  viewport: Types.IStackViewport | Types.IVolumeViewport,
  representation: LabelmapRepresentation
): Promise<void> {
  const { segmentationId, config } = representation;

  const segmentation = getSegmentation(segmentationId);

  if (!segmentation) {
    console.warn('No segmentation found for segmentationId: ', segmentationId);
    return;
  }

  let labelmapData =
    segmentation.representationData[SegmentationRepresentations.Labelmap];

  let labelmapActorEntries = getLabelmapActorEntries(
    viewport.id,
    segmentationId
  );

  if (
    !labelmapData &&
    canComputeRequestedRepresentation(
      segmentationId,
      SegmentationRepresentations.Labelmap
    ) &&
    !polySegConversionInProgress
  ) {
    // meaning the requested segmentation representationUID does not have
    // labelmap data, BUT we might be able to request a conversion from
    // another representation to labelmap
    // we need to check if we can request polySEG to convert the other
    // underlying representations to Surface
    polySegConversionInProgress = true;

    labelmapData = await computeAndAddLabelmapRepresentation(segmentationId, {
      viewport,
    });

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

  if (viewport instanceof VolumeViewport) {
    if (!labelmapActorEntries) {
      // only add the labelmap to ToolGroup viewports if it is not already added
      await _addLabelmapToViewport(
        viewport,
        labelmapData,
        segmentationId,
        config
      );
    }

    labelmapActorEntries = getLabelmapActorEntries(viewport.id, segmentationId);
  } else {
    // stack segmentation
    const labelmapImageIds = getCurrentLabelmapImageIdForViewportOverlapping(
      viewport.id,
      segmentationId
    );

    // if the stack labelmap is not built for the current imageId that is
    // rendered at the viewport then return
    if (!labelmapImageIds?.length) {
      return;
    }

    if (!labelmapActorEntries) {
      // only add the labelmap to ToolGroup viewports if it is not already added
      await _addLabelmapToViewport(
        viewport,
        labelmapData,
        segmentationId,
        config
      );
    }

    labelmapActorEntries = getLabelmapActorEntries(viewport.id, segmentationId);
  }

  if (!labelmapActorEntries) {
    return;
  }

  for (const labelmapActorEntry of labelmapActorEntries) {
    _setLabelmapColorAndOpacity(
      viewport.id,
      labelmapActorEntry,
      representation
    );
  }
}

function _setLabelmapColorAndOpacity(
  viewportId: string,
  labelmapActorEntry: Types.ActorEntry,
  segmentationRepresentation: SegmentationRepresentation
): void {
  const { segmentationId } = segmentationRepresentation;

  const { cfun, ofun } =
    segmentationRepresentation.config as LabelmapRenderingConfig;
  const { colorLUTIndex } = segmentationRepresentation;
  // todo fix this
  const activeSegmentation = getActiveSegmentation(viewportId);

  const isActiveLabelmap =
    activeSegmentation?.segmentationId === segmentationId;

  const labelmapStyle = segmentationStyle.getStyle({
    viewportId,
    type: SegmentationRepresentations.Labelmap,
    segmentationId,
  });

  const renderInactiveSegmentations =
    segmentationStyle.getRenderInactiveSegmentations(viewportId);

  // Note: MAX_NUMBER_COLORS = 256 is needed because the current method to generate
  // the default color table uses RGB.
  const colorLUT = getColorLUT(colorLUTIndex);
  const numColors = Math.min(256, colorLUT.length);

  // Note: right now outlineWidth and renderOutline are not configurable
  // at the segment level, so we don't need to check for segment specific
  // configuration in the loop, Todo: make them configurable at the segment level
  const {
    outlineWidth,
    renderOutline,
    outlineOpacity,
    activeSegmentOutlineWidthDelta,
  } = _getLabelmapConfig(labelmapStyle as LabelmapStyle, isActiveLabelmap);

  const segmentsHidden = internalGetHiddenSegmentIndices(viewportId, {
    segmentationId,
    type: SegmentationRepresentations.Labelmap,
  });

  // Todo: the below loop probably can be optimized so that we don't hit it
  // unless a config has changed. Right now we get into the following loop
  // even for brush drawing which does not makes sense
  for (let i = 0; i < numColors; i++) {
    const segmentIndex = i;
    const segmentColor = colorLUT[segmentIndex];

    const perSegmentStyle = segmentationStyle.getStyle({
      viewportId,
      type: SegmentationRepresentations.Labelmap,
      segmentationId,
      segmentIndex,
    });

    const segmentSpecificLabelmapConfig = perSegmentStyle;

    const { fillAlpha, outlineWidth, renderFill, renderOutline } =
      _getLabelmapConfig(
        labelmapStyle as LabelmapStyle,
        isActiveLabelmap,
        segmentSpecificLabelmapConfig
      );

    const { forceOpacityUpdate, forceColorUpdate } =
      _needsTransferFunctionUpdate(viewportId, segmentationId, segmentIndex, {
        fillAlpha,
        renderFill,
        renderOutline,
        segmentColor,
        outlineWidth,
        segmentsHidden: segmentsHidden as Set<number>,
        cfun,
        ofun,
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

  ofun.setClamping(false);
  const labelmapActor = labelmapActorEntry.actor as vtkVolume;

  // @ts-ignore - fix type in vtk
  const { preLoad } = labelmapActor.get?.('preLoad') || { preLoad: null };

  if (preLoad) {
    preLoad({ cfun, ofun, actor: labelmapActor });
  } else {
    labelmapActor.getProperty().setRGBTransferFunction(0, cfun);
    labelmapActor.getProperty().setScalarOpacity(0, ofun);
    labelmapActor.getProperty().setInterpolationTypeToNearest();
  }

  if (renderOutline) {
    // @ts-ignore - fix type in vtk
    labelmapActor.getProperty().setUseLabelOutline(renderOutline);

    // @ts-ignore - fix type in vtk
    labelmapActor.getProperty().setLabelOutlineOpacity(outlineOpacity);

    const activeSegmentIndex = getActiveSegmentIndex(
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
          ? outlineWidth + activeSegmentOutlineWidthDelta
          : outlineWidth;
    }

    labelmapActor.getProperty().setLabelOutlineThickness(outlineWidths);
  } else {
    // reset outline width to 0
    labelmapActor
      .getProperty()
      .setLabelOutlineThickness(new Array(numColors - 1).fill(0));
  }
  // Set visibility based on whether actor visibility is specifically asked
  // to be turned on/off (on by default) AND whether is is in active but
  // we are rendering inactive labelmap
  const visible = isActiveLabelmap || renderInactiveSegmentations;
  labelmapActor.setVisibility(visible);
}

function _getLabelmapConfig(
  labelmapConfig: LabelmapStyle,
  isActiveLabelmap: boolean,
  segmentsLabelmapConfig?: LabelmapStyle
) {
  const segmentLabelmapConfig = segmentsLabelmapConfig || {};

  const configToUse = {
    ...labelmapConfig,
    ...segmentLabelmapConfig,
  };

  const fillAlpha = isActiveLabelmap
    ? configToUse.fillAlpha
    : configToUse.fillAlphaInactive;
  const outlineWidth = isActiveLabelmap
    ? configToUse.outlineWidth
    : configToUse.outlineWidthInactive;

  const renderFill = isActiveLabelmap
    ? configToUse.renderFill
    : configToUse.renderFillInactive;

  const renderOutline = isActiveLabelmap
    ? configToUse.renderOutline
    : configToUse.renderOutlineInactive;

  const outlineOpacity = isActiveLabelmap
    ? configToUse.outlineOpacity
    : configToUse.outlineOpacityInactive;

  const activeSegmentOutlineWidthDelta =
    configToUse.activeSegmentOutlineWidthDelta;

  return {
    fillAlpha,
    outlineWidth,
    renderFill,
    renderOutline,
    outlineOpacity,
    activeSegmentOutlineWidthDelta,
  };
}

function _needsTransferFunctionUpdate(
  viewportId: string,
  segmentationId: string,
  segmentIndex: number,
  {
    fillAlpha,
    renderFill,
    renderOutline,
    segmentColor,
    outlineWidth,
    segmentsHidden,
    cfun,
    ofun,
  }: {
    fillAlpha: number;
    renderFill: boolean;
    renderOutline: boolean;
    outlineWidth: number;
    segmentColor: number[];
    segmentsHidden: Set<number>;
    cfun: vtkColorTransferFunction;
    ofun: vtkPiecewiseFunction;
  }
) {
  const cacheUID = `${viewportId}-${segmentationId}-${segmentIndex}`;
  const oldConfig = labelMapConfigCache.get(cacheUID);

  if (!oldConfig) {
    labelMapConfigCache.set(cacheUID, {
      fillAlpha,
      renderFill,
      renderOutline,
      outlineWidth,
      segmentColor: segmentColor.slice(), // Create a copy
      segmentsHidden: new Set(segmentsHidden), // Create a copy
      cfunMTime: cfun.getMTime(),
      ofunMTime: ofun.getMTime(),
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
    cfunMTime: oldCfunMTime,
    ofunMTime: oldOfunMTime,
  } = oldConfig;

  const forceColorUpdate =
    oldSegmentColor[0] !== segmentColor[0] ||
    oldSegmentColor[1] !== segmentColor[1] ||
    oldSegmentColor[2] !== segmentColor[2];
  // oldCfunMTime !== cfun.getMTime();

  const forceOpacityUpdate =
    oldSegmentColor[3] !== segmentColor[3] ||
    oldFillAlpha !== fillAlpha ||
    oldRenderFill !== renderFill ||
    oldRenderOutline !== renderOutline ||
    oldOutlineWidth !== outlineWidth ||
    oldSegmentsHidden !== segmentsHidden;

  // Update the cache only if needed
  if (forceOpacityUpdate || forceColorUpdate) {
    labelMapConfigCache.set(cacheUID, {
      fillAlpha,
      renderFill,
      renderOutline,
      outlineWidth,
      segmentColor: segmentColor.slice(), // Create a copy
      segmentsHidden: new Set(segmentsHidden), // Create a copy
      cfunMTime: cfun.getMTime(),
      ofunMTime: ofun.getMTime(),
    });
  }

  return {
    forceOpacityUpdate,
    forceColorUpdate,
  };
}

async function _addLabelmapToViewport(
  viewport: Types.IVolumeViewport | Types.IStackViewport,
  labelmapData: LabelmapSegmentationData,
  segmentationId: string,
  config: LabelmapRenderingConfig
): Promise<Types.ActorEntry | undefined> {
  const result = await addLabelmapToElement(
    viewport.element,
    labelmapData,
    segmentationId,
    config
  );
  return result || undefined;
}

export default {
  render,
  removeRepresentation,
};

export { render, removeRepresentation };
