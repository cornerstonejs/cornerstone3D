import type { Types } from '@cornerstonejs/core';
import {
  Enums as CoreEnums,
  eventTarget,
  getEnabledElementByViewportId,
} from '@cornerstonejs/core';

import type { LabelmapSegmentationData } from '../../../types/LabelmapTypes';
import type {
  LabelmapRenderingConfig,
  LabelmapRepresentation,
} from '../../../types/SegmentationStateTypes';

import addLabelmapToElement from './addLabelmapToElement';
import removeLabelmapFromElement from './removeLabelmapFromElement';
import { getCurrentLabelmapImageIdsForViewport } from '../../../stateManagement/segmentation/getCurrentLabelmapImageIdForViewport';
import { getSegmentation } from '../../../stateManagement/segmentation/getSegmentation';
import SegmentationRepresentations from '../../../enums/SegmentationRepresentations';
import { getLabelmapActorEntries } from '../../../stateManagement/segmentation/helpers/getSegmentationActor';
import { getPolySeg } from '../../../config';
import { computeAndAddRepresentation } from '../../../utilities/segmentation/computeAndAddRepresentation';
import { triggerSegmentationDataModified } from '../../../stateManagement/segmentation/triggerSegmentationEvents';
import { defaultSegmentationStateManager } from '../../../stateManagement/segmentation/SegmentationStateManager';
import { getLabelmaps } from '../../../stateManagement/segmentation/helpers/labelmapSegmentationState';
import {
  getVolumeLabelmapImageMapperRepresentationUIDs,
  updateVolumeLabelmapImageMapperActors,
} from './volumeLabelmapImageMapper';
import { createLabelmapRepresentationUID } from './labelmapRepresentationUID';
import { resolveLabelmapRenderPlan } from './labelmapRenderPlan';
import {
  MAX_NUMBER_COLORS,
  setLabelmapColorAndOpacity,
} from './labelmapActorStyle';

export { MAX_NUMBER_COLORS };
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
  viewport: Types.IViewport,
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
      () =>
        polySeg.computeLabelmapData(segmentationId, {
          viewport: viewport as Types.IVolumeViewport | Types.IStackViewport,
        }),
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

  const renderPlan = resolveLabelmapRenderPlan({
    viewport,
    segmentation,
    representation,
  });
  const shouldResyncActors = _haveLabelmapActorsChanged(
    viewport,
    segmentation,
    segmentationId,
    representation,
    labelmapActorEntries
  );

  if (renderPlan.kind === 'unsupported') {
    if (labelmapActorEntries?.length) {
      removeRepresentation(viewport.id, segmentationId);
    }

    if (renderPlan.unsupportedStateKey) {
      reportUnsupportedImageMapperError(
        viewport.id,
        segmentationId,
        renderPlan.unsupportedStateKey
      );
    }

    return;
  }

  clearUnsupportedImageMapperError(viewport.id, segmentationId);

  if (renderPlan.renderMode === 'volume') {
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
  } else if (renderPlan.renderMode === 'image') {
    if (!renderPlan.isVolumeImageMapper) {
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

    if (renderPlan.isVolumeImageMapper && labelmapActorEntries?.length) {
      updateVolumeLabelmapImageMapperActors({
        viewport,
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
    setLabelmapColorAndOpacity(viewport.id, labelmapActorEntry, representation);
  }
}

function _haveLabelmapActorsChanged(
  viewport: Types.IViewport,
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
  viewport: Types.IViewport,
  segmentation: NonNullable<ReturnType<typeof getSegmentation>>,
  segmentationId: string,
  representation: LabelmapRepresentation
): string[] {
  const renderPlan = resolveLabelmapRenderPlan({
    viewport,
    segmentation,
    representation,
  });

  if (renderPlan.renderMode === 'volume') {
    return getLabelmaps(segmentation)
      .filter((layer) => !!layer.volumeId)
      .map((layer) =>
        createLabelmapRepresentationUID({
          segmentationId,
          referencedId: layer.labelmapId,
        })
      );
  }

  if (renderPlan.renderMode === 'image') {
    if (renderPlan.isVolumeImageMapper) {
      return getVolumeLabelmapImageMapperRepresentationUIDs(
        viewport,
        segmentationId,
        segmentation
      );
    }

    return (
      getCurrentLabelmapImageIdsForViewport(viewport.id, segmentationId)?.map(
        (imageId) =>
          createLabelmapRepresentationUID({
            segmentationId,
            referencedId: imageId,
          })
      ) ?? []
    );
  }

  return [];
}

async function _addLabelmapToViewport(
  viewport: Types.IViewport,
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
  _viewport: Types.IViewport
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
