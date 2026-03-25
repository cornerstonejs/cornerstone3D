import { getEnabledElementByViewportId } from '@cornerstonejs/core';

import type { SegmentationDataModifiedEventType } from '../../../types/EventTypes';
import { SegmentationRepresentations } from '../../../enums';
import { performVolumeLabelmapUpdate } from './performVolumeLabelmapUpdate';
import { performStackLabelmapUpdate } from './performStackLabelmapUpdate';
import { getSegmentation } from '../../../stateManagement/segmentation/getSegmentation';
import { getViewportIdsWithSegmentation } from '../../../stateManagement/segmentation/getViewportIdsWithSegmentation';
import getViewportLabelmapRenderMode from '../../../stateManagement/segmentation/helpers/getViewportLabelmapRenderMode';

const getViewportByViewportId = (viewportId: string) => {
  const enabledElement = getEnabledElementByViewportId(viewportId);
  return enabledElement?.viewport ?? undefined;
};

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

  viewportIds.forEach((viewportId) => {
    const viewport = getViewportByViewportId(viewportId);

    if (!viewport) {
      return;
    }

    const renderMode = getViewportLabelmapRenderMode(viewport);

    if (renderMode === 'volume') {
      volumeViewportIds.push(viewportId);
      return;
    }

    if (renderMode === 'image') {
      stackViewportIds.push(viewportId);
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
};

export default onLabelmapSegmentationDataModified;
