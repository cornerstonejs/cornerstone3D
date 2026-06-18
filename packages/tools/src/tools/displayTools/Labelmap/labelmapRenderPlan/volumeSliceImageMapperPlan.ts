import type { Types } from '@cornerstonejs/core';
import type { ViewportLabelmapRenderMode } from '../../../../stateManagement/segmentation/helpers/getViewportLabelmapRenderMode';
import type { Segmentation } from '../../../../types/SegmentationStateTypes';
import { triggerSegmentationDataModified } from '../../../../stateManagement/segmentation/triggerSegmentationEvents';
import {
  addVolumeLabelmapImageMapperActors,
  getVolumeLabelmapImageMapperRepresentationUIDs,
  updateVolumeLabelmapImageMapperActors,
} from '../volumeLabelmapImageMapper';
import { createLabelmapRenderPlan } from './createLabelmapRenderPlan';
import type { LabelmapRenderPlan } from './types';

function createVolumeSliceImageMapperPlan({
  isVolumeImageMapper,
  renderMode,
  segmentation,
  segmentationId,
  useSliceRendering,
  viewport,
}: {
  isVolumeImageMapper: boolean;
  renderMode: ViewportLabelmapRenderMode;
  segmentation: Segmentation;
  segmentationId: string;
  useSliceRendering: boolean;
  viewport: Types.IViewport;
}): LabelmapRenderPlan {
  return createLabelmapRenderPlan({
    isVolumeImageMapper,
    kind: 'volume-slice-image-mapper',
    renderMode,
    segmentationId,
    useSliceRendering,
    viewport,
    getExpectedRepresentationUIDs: () =>
      getVolumeLabelmapImageMapperRepresentationUIDs(
        viewport,
        segmentationId,
        segmentation
      ),
    mount: () =>
      mountVolumeLabelmapImageMapper({
        viewport,
        segmentation,
        segmentationId,
      }),
    update: ({ actorEntries }) =>
      updateVolumeLabelmapImageMapperActors({
        viewport,
        segmentation,
        segmentationId,
        actorEntries,
      }),
  });
}

async function mountVolumeLabelmapImageMapper({
  viewport,
  segmentation,
  segmentationId,
}: {
  viewport: Types.IViewport;
  segmentation: Segmentation;
  segmentationId: string;
}): Promise<void> {
  await addVolumeLabelmapImageMapperActors({
    viewport,
    segmentation,
    segmentationId,
  });
  triggerSegmentationDataModified(segmentationId);
}

export { createVolumeSliceImageMapperPlan };
