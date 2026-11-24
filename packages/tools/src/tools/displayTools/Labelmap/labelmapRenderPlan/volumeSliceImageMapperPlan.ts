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
import { getRenderPlanLayer } from '../../../../utilities/viewport/getRenderPlanLayer';
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
      !isVolumeMountedActorEntry(viewport, actorEntry),
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

/**
 * Whether the viewport draws an actor entry from a volume: its layer in the
 * render plan cuts the slice out of a volume (`cpu` or `gpuVolume`).
 */
function isVolumeMountedActorEntry(
  viewport: Types.IViewport,
  actorEntry: Types.ActorEntry
): boolean {
  const slice = getRenderPlanLayer(viewport, actorEntry.displaySetId)?.slice;

  return slice === 'cpu' || slice === 'gpuVolume';
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
