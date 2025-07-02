import {
  VolumeViewport,
  getEnabledElementByViewportId,
  StackViewport,
  BaseVolumeViewport,
} from '@cornerstonejs/core';

import type { SegmentationDataModifiedEventType } from '../../../types/EventTypes';
import { SegmentationRepresentations } from '../../../enums';
import { performVolumeLabelmapUpdate } from './performVolumeLabelmapUpdate';
import { performStackLabelmapUpdate } from './performStackLabelmapUpdate';
import { getSegmentation } from '../../../stateManagement/segmentation/getSegmentation';
import { getViewportIdsWithSegmentation } from '../../../stateManagement/segmentation/getViewportIdsWithSegmentation';

/** A callback function that is called when the segmentation data is modified which
 *  often is as a result of tool interactions e.g., scissors, eraser, etc.
 */
const onLabelmapSegmentationDataModified = function (
  evt: SegmentationDataModifiedEventType
): void {
  const { segmentationId, modifiedSlicesToUse } = evt.detail;

  const { representationData } = getSegmentation(segmentationId);

  const viewportIds = getViewportIdsWithSegmentation(segmentationId);

  const hasVolumeViewport = viewportIds.some((viewportId) => {
    const { viewport } = getEnabledElementByViewportId(viewportId);
    return viewport instanceof BaseVolumeViewport;
  });

  const hasStackViewport = viewportIds.some((viewportId) => {
    const { viewport } = getEnabledElementByViewportId(viewportId);
    return viewport instanceof StackViewport;
  });

  const hasBothStackAndVolume = hasVolumeViewport && hasStackViewport;

  viewportIds.forEach((viewportId) => {
    const { viewport } = getEnabledElementByViewportId(viewportId);

    if (viewport instanceof BaseVolumeViewport) {
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

    if (viewport instanceof StackViewport) {
      performStackLabelmapUpdate({
        viewportIds,
        segmentationId,
      });
    }
  });
};

export default onLabelmapSegmentationDataModified;
