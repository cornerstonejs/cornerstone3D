import { ActorRenderMode, type Types } from '@cornerstonejs/core';
import type { ViewportLabelmapRenderMode } from '../../../../stateManagement/segmentation/helpers/getViewportLabelmapRenderMode';
import type { Segmentation } from '../../../../types/SegmentationStateTypes';
import { triggerSegmentationDataModified } from '../../../../stateManagement/segmentation/triggerSegmentationEvents';
import {
  addVolumeLabelmapImageMapperActors,
  getVolumeLabelmapImageMapperRepresentationUIDs,
  updateVolumeLabelmapImageMapperActors,
} from '../volumeLabelmapImageMapper';
import {
  createLabelmapRenderPlan,
  getActorEntryRenderMode,
} from './createLabelmapRenderPlan';
import type { LabelmapRenderPlan } from './types';

/**
 * The plan that draws a labelmap of a volume as labelmap slice images.
 * `outlineAtImageEdges` is true when the slice images stand in for the volume
 * plan only because the viewport samples its source on the CPU: the slices
 * then draw the label outline at the faces of the volume, as the volume plan
 * does, so that a move between the two plans does not change the picture.
 */
function createVolumeSliceImageMapperPlan({
  isVolumeImageMapper,
  outlineAtImageEdges,
  renderMode,
  segmentation,
  segmentationId,
  useSliceRendering,
  viewport,
}: {
  isVolumeImageMapper: boolean;
  outlineAtImageEdges: boolean;
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
    // An actor surviving from a volume mount (e.g. remounted in place by a
    // live render-backend switch back to the GPU) shares this plan's
    // representation UID but not its shape; force a remount through the
    // image-mapper path.
    isActorEntryCompatible: (actorEntry) =>
      !isVolumeMountedActorEntry(actorEntry),
    mount: () =>
      mountVolumeLabelmapImageMapper({
        viewport,
        segmentation,
        segmentationId,
        outlineAtImageEdges,
      }),
    update: ({ actorEntries }) =>
      updateVolumeLabelmapImageMapperActors({
        viewport,
        segmentation,
        segmentationId,
        actorEntries,
        outlineAtImageEdges,
      }),
  });
}

function isVolumeMountedActorEntry(actorEntry: Types.ActorEntry): boolean {
  const renderMode = getActorEntryRenderMode(actorEntry);

  return (
    renderMode === ActorRenderMode.VTK_VOLUME ||
    renderMode === ActorRenderMode.VTK_VOLUME_SLICE ||
    renderMode === ActorRenderMode.VTK_SAMPLED_SLICE ||
    renderMode === ActorRenderMode.CPU_VOLUME
  );
}

async function mountVolumeLabelmapImageMapper({
  viewport,
  segmentation,
  segmentationId,
  outlineAtImageEdges,
}: {
  viewport: Types.IViewport;
  segmentation: Segmentation;
  segmentationId: string;
  outlineAtImageEdges: boolean;
}): Promise<void> {
  await addVolumeLabelmapImageMapperActors({
    viewport,
    segmentation,
    segmentationId,
    outlineAtImageEdges,
  });
  triggerSegmentationDataModified(segmentationId);
}

export { createVolumeSliceImageMapperPlan };
