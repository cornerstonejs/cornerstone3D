import {
  ActorRenderMode,
  Enums,
  getEnabledElementByViewportId,
  type Types,
} from '@cornerstonejs/core';

import type { SegmentationDataModifiedEventType } from '../../../types/EventTypes';
import { SegmentationRepresentations } from '../../../enums';
import { performVolumeLabelmapUpdate } from './performVolumeLabelmapUpdate';
import { performStackLabelmapUpdate } from './performStackLabelmapUpdate';
import { getSegmentation } from '../../../stateManagement/segmentation/getSegmentation';
import { getViewportIdsWithSegmentation } from '../../../stateManagement/segmentation/getViewportIdsWithSegmentation';
import { getSegmentationRepresentations } from '../../../stateManagement/segmentation/getSegmentationRepresentation';
import getViewportLabelmapRenderMode from '../../../stateManagement/segmentation/helpers/getViewportLabelmapRenderMode';
import { triggerSegmentationRender } from '../../../stateManagement/segmentation/SegmentationRenderingEngine';
import { getLabelmapActorEntries } from '../../../stateManagement/segmentation/helpers/getSegmentationActor';
import { getLabelmaps } from '../../../stateManagement/segmentation/helpers/labelmapSegmentationState';
import {
  canRenderVolumeViewportLabelmapAsImage,
  shouldUseSliceRendering,
} from '../../../stateManagement/segmentation/helpers/labelmapImageMapperSupport';

const getViewportByViewportId = (viewportId: string) => {
  const enabledElement = getEnabledElementByViewportId(viewportId);
  return enabledElement?.viewport ?? undefined;
};

type NextPlanarVolumeLabelmapViewport = ReturnType<
  typeof getViewportByViewportId
> & {
  removeData?: (dataId: string) => void;
  getDefaultActor?: () =>
    | {
        actorMapper?: {
          renderMode?: Types.ActorRenderMode;
        };
      }
    | undefined;
  type?: string;
};

function isNextPlanarVolumeLabelmapViewport(
  viewport: ReturnType<typeof getViewportByViewportId>
): viewport is NextPlanarVolumeLabelmapViewport {
  const compatibilityViewport = viewport as NextPlanarVolumeLabelmapViewport;

  return (
    compatibilityViewport?.type === Enums.ViewportType.PLANAR_NEXT &&
    compatibilityViewport.getDefaultActor?.()?.actorMapper?.renderMode ===
      ActorRenderMode.VTK_VOLUME_SLICE &&
    typeof compatibilityViewport.removeData === 'function'
  );
}

function shouldRefreshSingleLayerNextPlanarVolumeLabelmap(
  segmentationId: string
): boolean {
  const segmentation = getSegmentation(segmentationId);

  if (!segmentation) {
    return false;
  }

  return (
    getLabelmaps(segmentation).filter((layer) => !!layer.volumeId).length === 1
  );
}

function refreshNextPlanarVolumeLabelmapBindings(
  viewportId: string,
  segmentationId: string
): boolean {
  const viewport = getViewportByViewportId(viewportId);

  if (!isNextPlanarVolumeLabelmapViewport(viewport)) {
    return false;
  }

  const actorEntries = getLabelmapActorEntries(viewportId, segmentationId);

  if (!actorEntries?.length) {
    return false;
  }

  actorEntries.forEach((actorEntry) => {
    const dataId = actorEntry.representationUID ?? actorEntry.uid;

    if (typeof dataId === 'string') {
      viewport.removeData?.(dataId);
    }
  });

  return true;
}

/** A callback function that is called when the segmentation data is modified which
 *  often is as a result of tool interactions e.g., scissors, eraser, etc.
 */
const onLabelmapSegmentationDataModified = function (
  evt: SegmentationDataModifiedEventType
): void {
  const { segmentationId, modifiedSlicesToUse } = evt.detail;

  const { representationData } = getSegmentation(segmentationId);

  const viewportIds = getViewportIdsWithSegmentation(segmentationId);
  const volumeViewportIds: string[] = [];
  const stackViewportIds: string[] = [];
  const imageMapperViewportIds: string[] = [];
  const nextPlanarVolumeViewportIdsToRefresh: string[] = [];

  viewportIds.forEach((viewportId) => {
    const viewport = getViewportByViewportId(viewportId);

    if (!viewport) {
      return;
    }

    const labelmapRepresentation = getSegmentationRepresentations(viewportId, {
      segmentationId,
      type: SegmentationRepresentations.Labelmap,
    })[0] as { config?: { useSliceRendering?: boolean } } | undefined;
    const useSliceRendering = shouldUseSliceRendering(
      getSegmentation(segmentationId),
      labelmapRepresentation?.config
    );
    const renderMode = getViewportLabelmapRenderMode(viewport, {
      useSliceRendering,
    });

    if (renderMode === 'volume') {
      if (
        isNextPlanarVolumeLabelmapViewport(viewport) &&
        shouldRefreshSingleLayerNextPlanarVolumeLabelmap(segmentationId)
      ) {
        nextPlanarVolumeViewportIdsToRefresh.push(viewportId);
      }

      volumeViewportIds.push(viewportId);
      return;
    }

    if (renderMode === 'image') {
      if (
        useSliceRendering &&
        canRenderVolumeViewportLabelmapAsImage(viewport)
      ) {
        imageMapperViewportIds.push(viewportId);
      } else {
        stackViewportIds.push(viewportId);
      }
    }
  });

  const hasVolumeViewport = volumeViewportIds.length > 0;
  const hasStackViewport = stackViewportIds.length > 0;

  const hasBothStackAndVolume = hasVolumeViewport && hasStackViewport;

  if (hasVolumeViewport) {
    // For combined stack and volume scenarios in the rendering engine, updating only affected
    // slices is not ideal. Stack indices (e.g., 0 for just one image) don't
    // correspond to image indices in the volume. In this case, we update all slices.
    // However, for volume-only scenarios, we update only affected slices.
    performVolumeLabelmapUpdate({
      modifiedSlicesToUse: hasBothStackAndVolume ? [] : modifiedSlicesToUse,
      representationData,
      type: SegmentationRepresentations.Labelmap,
    });
  }

  if (hasStackViewport) {
    performStackLabelmapUpdate({
      viewportIds: stackViewportIds,
      segmentationId,
    });
  }

  imageMapperViewportIds.forEach((viewportId) => {
    triggerSegmentationRender(viewportId);
  });

  nextPlanarVolumeViewportIdsToRefresh.forEach((viewportId) => {
    if (refreshNextPlanarVolumeLabelmapBindings(viewportId, segmentationId)) {
      triggerSegmentationRender(viewportId);
    }
  });
};

export default onLabelmapSegmentationDataModified;
