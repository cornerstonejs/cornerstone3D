import type { Types } from '@cornerstonejs/core';
import {
  BaseVolumeViewport,
  Enums as CoreEnums,
  eventTarget,
  getEnabledElementByViewportId,
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
import { getCurrentLabelmapImageIdsForViewport } from '../../../stateManagement/segmentation/getCurrentLabelmapImageIdForViewport';
import { getSegmentation } from '../../../stateManagement/segmentation/getSegmentation';
import vtkColorTransferFunction from '@kitware/vtk.js/Rendering/Core/ColorTransferFunction';
import vtkPiecewiseFunction from '@kitware/vtk.js/Common/DataModel/PiecewiseFunction';
import { segmentationStyle } from '../../../stateManagement/segmentation/SegmentationStyle';
import SegmentationRepresentations from '../../../enums/SegmentationRepresentations';
import { internalGetHiddenSegmentIndices } from '../../../stateManagement/segmentation/helpers/internalGetHiddenSegmentIndices';
import { getActiveSegmentIndex } from '../../../stateManagement/segmentation/getActiveSegmentIndex';
import type vtkVolume from '@kitware/vtk.js/Rendering/Core/Volume';
import { getLabelmapActorEntries } from '../../../stateManagement/segmentation/helpers/getSegmentationActor';
import { getPolySeg } from '../../../config';
import { computeAndAddRepresentation } from '../../../utilities/segmentation/computeAndAddRepresentation';
import { triggerSegmentationDataModified } from '../../../stateManagement/segmentation/triggerSegmentationEvents';
import { defaultSegmentationStateManager } from '../../../stateManagement/segmentation/SegmentationStateManager';
import type vtkImageSlice from '@kitware/vtk.js/Rendering/Core/ImageSlice';
import getViewportLabelmapRenderMode from '../../../stateManagement/segmentation/helpers/getViewportLabelmapRenderMode';
import {
  getVolumeViewportLabelmapImageMapperState,
  shouldUseSliceRendering,
} from '../../../stateManagement/segmentation/helpers/labelmapImageMapperSupport';
import {
  getSegmentBinding,
  getLabelmaps,
} from '../../../stateManagement/segmentation/helpers/labelmapSegmentationState';
import {
  getLabelmapForActorReference,
  getVolumeLabelmapImageMapperRepresentationUIDs,
  updateVolumeLabelmapImageMapperActors,
} from './volumeLabelmapImageMapper';

// 255 itself is used as preview color, so basically
// we have 254 colors to use for the segments if we are using the preview.
export const MAX_NUMBER_COLORS = 255;
const labelMapConfigCache = new Map();
const unsupportedImageMapperStates = new Map<string, string>();

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
  clearUnsupportedImageMapperError(viewportId, segmentationId);
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
    getPolySeg()?.canComputeRequestedRepresentation(
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

    const polySeg = getPolySeg();

    labelmapData = await computeAndAddRepresentation(
      segmentationId,
      SegmentationRepresentations.Labelmap,
      () => polySeg.computeLabelmapData(segmentationId, { viewport }),
      () => {
        defaultSegmentationStateManager.processLabelmapRepresentationAddition(
          viewport.id,
          segmentationId
        );

        /// need to figure out how to trigger the labelmap update properly
        setTimeout(() => {
          triggerSegmentationDataModified(segmentationId);
        }, 0);
      }
    );

    if (!labelmapData) {
      throw new Error(
        `No labelmap data found for segmentationId ${segmentationId}.`
      );
    }

    polySegConversionInProgress = false;
  } else if (!labelmapData && !getPolySeg()) {
    console.debug(
      `No labelmap data found for segmentationId ${segmentationId} and PolySeg add-on is not configured. Unable to convert from other representations to labelmap. Please register PolySeg using cornerstoneTools.init({ addons: { polySeg } }) to enable automatic conversion.`
    );
  }

  if (!labelmapData) {
    return;
  }

  const useSliceRendering = shouldUseSliceRendering(segmentation, config);
  const renderMode = getViewportLabelmapRenderMode(viewport, {
    useSliceRendering,
  });
  const shouldResyncActors = _haveLabelmapActorsChanged(
    viewport,
    segmentation,
    segmentationId,
    representation,
    labelmapActorEntries
  );

  if (renderMode === 'unsupported') {
    if (labelmapActorEntries?.length) {
      removeRepresentation(viewport.id, segmentationId);
    }

    if (useSliceRendering) {
      const state = getVolumeViewportLabelmapImageMapperState(viewport);
      reportUnsupportedImageMapperError(viewport.id, segmentationId, state.key);
    }

    return;
  }

  clearUnsupportedImageMapperError(viewport.id, segmentationId);

  if (renderMode === 'volume') {
    if (shouldResyncActors && labelmapActorEntries?.length) {
      removeRepresentation(viewport.id, segmentationId);
      labelmapActorEntries = undefined;
    }

    if (!labelmapActorEntries?.length) {
      // only add the labelmap to ToolGroup viewports if it is not already added
      await _addLabelmapToViewport(
        viewport,
        labelmapData,
        segmentationId,
        config
      );
    }

    labelmapActorEntries = getLabelmapActorEntries(viewport.id, segmentationId);
  } else if (renderMode === 'image') {
    const isVolumeImageMapper =
      useSliceRendering && viewport instanceof BaseVolumeViewport;

    if (!isVolumeImageMapper) {
      const labelmapImageIds = getCurrentLabelmapImageIdsForViewport(
        viewport.id,
        segmentationId
      );

      if (!labelmapImageIds?.length) {
        return;
      }
    }

    if (shouldResyncActors && labelmapActorEntries?.length) {
      removeRepresentation(viewport.id, segmentationId);
      labelmapActorEntries = undefined;
    }

    if (!labelmapActorEntries?.length) {
      // only add the labelmap to ToolGroup viewports if it is not already added
      await _addLabelmapToViewport(
        viewport,
        labelmapData,
        segmentationId,
        config
      );
    }

    labelmapActorEntries = getLabelmapActorEntries(viewport.id, segmentationId);

    if (isVolumeImageMapper && labelmapActorEntries?.length) {
      updateVolumeLabelmapImageMapperActors({
        viewport: viewport as Types.IVolumeViewport,
        segmentation,
        segmentationId,
        actorEntries: labelmapActorEntries,
      });
    }
  } else {
    return;
  }

  if (!labelmapActorEntries?.length) {
    return;
  }

  for (const labelmapActorEntry of labelmapActorEntries) {
    // call the function to set the color and opacity
    _setLabelmapColorAndOpacity(
      viewport.id,
      labelmapActorEntry,
      representation
    );
  }
}

function _haveLabelmapActorsChanged(
  viewport: Types.IStackViewport | Types.IVolumeViewport,
  segmentation: ReturnType<typeof getSegmentation>,
  segmentationId: string,
  representation: LabelmapRepresentation,
  labelmapActorEntries?: Types.ActorEntry[]
): boolean {
  if (!segmentation) {
    return false;
  }

  const actualUIDs = new Set(
    (labelmapActorEntries ?? []).map((entry) => entry.representationUID)
  );
  const expectedUIDs = new Set(
    _getExpectedLabelmapRepresentationUIDs(
      viewport,
      segmentation,
      segmentationId,
      representation
    )
  );

  if (actualUIDs.size !== expectedUIDs.size) {
    return true;
  }

  for (const expectedUID of expectedUIDs) {
    if (!actualUIDs.has(expectedUID)) {
      return true;
    }
  }

  return false;
}

function _getExpectedLabelmapRepresentationUIDs(
  viewport: Types.IStackViewport | Types.IVolumeViewport,
  segmentation: NonNullable<ReturnType<typeof getSegmentation>>,
  segmentationId: string,
  representation: LabelmapRepresentation
): string[] {
  const useSliceRendering = shouldUseSliceRendering(
    segmentation,
    representation.config
  );
  const renderMode = getViewportLabelmapRenderMode(viewport, {
    useSliceRendering,
  });

  if (renderMode === 'volume') {
    return getLabelmaps(segmentation)
      .filter((layer) => !!layer.volumeId)
      .map(
        (layer) =>
          `${segmentationId}-${SegmentationRepresentations.Labelmap}-${layer.labelmapId}`
      );
  }

  if (renderMode === 'image') {
    if (useSliceRendering && viewport instanceof BaseVolumeViewport) {
      return getVolumeLabelmapImageMapperRepresentationUIDs(
        viewport,
        segmentationId,
        segmentation
      );
    }

    return (
      getCurrentLabelmapImageIdsForViewport(viewport.id, segmentationId)?.map(
        (imageId) =>
          `${segmentationId}-${SegmentationRepresentations.Labelmap}-${imageId}`
      ) ?? []
    );
  }

  return [];
}

function _setLabelmapColorAndOpacity(
  viewportId: string,
  labelmapActorEntry: Types.ActorEntry,
  segmentationRepresentation: SegmentationRepresentation
): void {
  const { segmentationId } = segmentationRepresentation;
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
  const segmentation = getSegmentation(segmentationId);
  const layer = getLabelmapForActorReference(
    segmentation,
    labelmapActorEntry.referencedId
  );
  const layerBindings = Object.keys(segmentation.segments)
    .map(Number)
    .map((segmentIndex) => ({
      segmentIndex,
      binding: getSegmentBinding(segmentation, segmentIndex),
    }))
    .filter(
      (entry) => !layer || entry.binding?.labelmapId === layer.labelmapId
    );
  const maxLabelValue = Math.max(
    1,
    ...layerBindings.map(
      (entry) => entry.binding?.labelValue ?? entry.segmentIndex
    )
  );
  const numColors = Math.max(colorLUT.length, maxLabelValue + 1);
  const labelValueEntries = Array.from(
    { length: numColors - 1 },
    (_, index) => {
      const labelValue = index + 1;
      const segmentIndex =
        layer?.labelToSegmentIndex?.[labelValue] ?? labelValue;

      return {
        labelValue,
        segmentIndex,
      };
    }
  );

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

  const cfun = vtkColorTransferFunction.newInstance();
  const ofun = vtkPiecewiseFunction.newInstance();

  const colorNodes = [{ x: 0, r: 0, g: 0, b: 0, midpoint: 0.5, sharpness: 0 }];
  const opacityNodes = [{ x: 0, y: 0, midpoint: 0.5, sharpness: 0 }];

  labelValueEntries.forEach(({ labelValue, segmentIndex }) => {
    const segmentColor = colorLUT[segmentIndex];
    if (!segmentColor) {
      return;
    }

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

    colorNodes.push({
      x: labelValue,
      r: segmentColor[0] / MAX_NUMBER_COLORS,
      g: segmentColor[1] / MAX_NUMBER_COLORS,
      b: segmentColor[2] / MAX_NUMBER_COLORS,
      midpoint: 0.5,
      sharpness: 0,
    });

    if (renderFill) {
      const segmentOpacity = segmentsHidden.has(segmentIndex)
        ? 0
        : (segmentColor[3] / 255) * fillAlpha;

      opacityNodes.push({
        x: labelValue,
        y: segmentOpacity,
        midpoint: 0.5,
        sharpness: 0,
      });
    } else {
      opacityNodes.push({
        x: labelValue,
        y: 0.01,
        midpoint: 0.5,
        sharpness: 0,
      });
    }
  });

  cfun.setNodes(colorNodes);
  ofun.setNodes(opacityNodes);

  ofun.setClamping(false);
  const labelmapActor = labelmapActorEntry.actor as vtkVolume | vtkImageSlice;
  const actorMapper = labelmapActorEntry.actorMapper as
    | {
        mapper?: {
          modified?: () => void;
        };
      }
    | undefined;
  const labelmapMapper = actorMapper?.mapper
    ? actorMapper.mapper
    : labelmapActor.getMapper();

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
    const outlineWidths = new Array(numColors - 1).fill(0);

    labelValueEntries.forEach(({ labelValue, segmentIndex }) => {
      const isHidden = segmentsHidden.has(segmentIndex);
      if (isHidden) {
        return;
      }

      outlineWidths[labelValue - 1] =
        segmentIndex === activeSegmentIndex
          ? outlineWidth + activeSegmentOutlineWidthDelta
          : outlineWidth;
    });

    labelmapActor.getProperty().setLabelOutlineThickness(outlineWidths);
    // Mark the actor as modified to ensure the changes are applied
    labelmapActor.modified();
    labelmapActor.getProperty().modified();
    labelmapMapper?.modified?.();
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

/**
 * Function to call when segmentation representation is updated
 *
 * @param viewport
 * @returns
 */
function getUpdateFunction(
  viewport: Types.IVolumeViewport | Types.IStackViewport
): (segmentationId: string) => Promise<void> | null {
  return;
}

function getUnsupportedImageMapperStateKey(
  viewportId: string,
  segmentationId: string
): string {
  return `${viewportId}:${segmentationId}`;
}

function clearUnsupportedImageMapperError(
  viewportId: string,
  segmentationId: string
): void {
  unsupportedImageMapperStates.delete(
    getUnsupportedImageMapperStateKey(viewportId, segmentationId)
  );
}

function reportUnsupportedImageMapperError(
  viewportId: string,
  segmentationId: string,
  stateKey: string
): void {
  const cacheKey = getUnsupportedImageMapperStateKey(
    viewportId,
    segmentationId
  );
  const previousStateKey = unsupportedImageMapperStates.get(cacheKey);

  if (previousStateKey === stateKey) {
    return;
  }

  unsupportedImageMapperStates.set(cacheKey, stateKey);

  eventTarget.dispatchEvent(
    new CustomEvent(CoreEnums.Events.ERROR_EVENT, {
      detail: {
        type: 'Segmentation',
        message:
          'Labelmap image-mapper rendering is only supported on legacy orthographic single-slice volume viewports.',
      },
      cancelable: true,
    })
  );
}

export default {
  getUpdateFunction,
  render,
  removeRepresentation,
};

export { render, removeRepresentation };
