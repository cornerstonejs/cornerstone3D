import type { Types, PlanarViewport } from '@cornerstonejs/core';
import type { ViewportLabelmapRenderMode } from '../../../../stateManagement/segmentation/helpers/getViewportLabelmapRenderMode';
import { getCurrentLabelmapImageIdsForViewport } from '../../../../stateManagement/segmentation/getCurrentLabelmapImageIdForViewport';
import { triggerSegmentationDataModified } from '../../../../stateManagement/segmentation/triggerSegmentationEvents';
import {
  getCurrentStackLabelmapImages,
  syncStackLabelmapActors,
} from '../syncStackLabelmapActors';
import { createLabelmapRenderPlan } from './createLabelmapRenderPlan';
import type { LabelmapRenderPlan } from './types';

function createStackImageLabelmapPlan({
  isVolumeImageMapper,
  renderMode,
  segmentationId,
  useSliceRendering,
  viewport,
}: {
  isVolumeImageMapper: boolean;
  renderMode: ViewportLabelmapRenderMode;
  segmentationId: string;
  useSliceRendering: boolean;
  viewport: Types.IViewport;
}): LabelmapRenderPlan {
  return createLabelmapRenderPlan({
    isVolumeImageMapper,
    kind: 'legacy-stack-image',
    renderMode,
    segmentationId,
    updateAfterMount: false,
    useSliceRendering,
    viewport,
    canRenderCurrentViewport: () =>
      hasCurrentStackLabelmapImageIds(viewport, segmentationId),
    getExpectedRepresentationUIDs: () =>
      getExpectedStackLabelmapRepresentationUIDs(viewport, segmentationId),
    mount: () => mountStackLabelmapActors(viewport, segmentationId),
    update: () =>
      syncStackLabelmapActors(viewport as PlanarViewport, segmentationId),
  });
}

function hasCurrentStackLabelmapImageIds(
  viewport: Types.IViewport,
  segmentationId: string
): boolean {
  return !!getCurrentLabelmapImageIdsForViewport(viewport.id, segmentationId)
    ?.length;
}

function getExpectedStackLabelmapRepresentationUIDs(
  viewport: Types.IViewport,
  segmentationId: string
): string[] {
  return getCurrentStackLabelmapImages(viewport.id, segmentationId).map(
    ({ representationUID }) => representationUID
  );
}

async function mountStackLabelmapActors(
  viewport: Types.IViewport,
  segmentationId: string
): Promise<void> {
  syncStackLabelmapActors(viewport as PlanarViewport, segmentationId);
  triggerSegmentationDataModified(segmentationId);
}

export { createStackImageLabelmapPlan };
