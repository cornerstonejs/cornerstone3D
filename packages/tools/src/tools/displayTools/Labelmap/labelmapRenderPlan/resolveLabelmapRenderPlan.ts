import type { Types } from '@cornerstonejs/core';
import type { Segmentation } from '../../../../types/SegmentationStateTypes';
import getViewportLabelmapRenderMode from '../../../../stateManagement/segmentation/helpers/getViewportLabelmapRenderMode';
import {
  canRenderVolumeViewportLabelmapAsImage,
  getVolumeViewportLabelmapImageMapperState,
  shouldUseSliceRendering,
} from '../../../../stateManagement/segmentation/helpers/labelmapImageMapperSupport';
import { createLabelmapRenderPlan } from './createLabelmapRenderPlan';
import { createLegacyVolumeLabelmapPlan } from './legacyVolumePlan';
import { createStackImageLabelmapPlan } from './stackImagePlan';
import { createVolumeSliceImageMapperPlan } from './volumeSliceImageMapperPlan';
import type {
  LabelmapRenderPlan,
  LabelmapRenderPlanRepresentation,
} from './types';

function resolveLabelmapRenderPlan({
  viewport,
  segmentation,
  representation,
}: {
  viewport: Types.IViewport;
  segmentation: Segmentation;
  representation: LabelmapRenderPlanRepresentation;
}): LabelmapRenderPlan {
  const { segmentationId, config } = representation;
  const useSliceRendering = shouldUseSliceRendering(segmentation, config);
  const renderMode = getViewportLabelmapRenderMode(viewport, {
    useSliceRendering,
  });
  const isVolumeImageMapper =
    useSliceRendering && canRenderVolumeViewportLabelmapAsImage(viewport);

  if (renderMode === 'unsupported') {
    return createLabelmapRenderPlan({
      isVolumeImageMapper,
      kind: 'unsupported',
      renderMode,
      segmentationId,
      unsupportedStateKey: useSliceRendering
        ? getVolumeViewportLabelmapImageMapperState(viewport).key
        : undefined,
      useSliceRendering,
      viewport,
    });
  }

  if (isVolumeImageMapper) {
    return createVolumeSliceImageMapperPlan({
      isVolumeImageMapper,
      renderMode,
      segmentation,
      segmentationId,
      useSliceRendering,
      viewport,
    });
  }

  if (renderMode === 'volume') {
    return createLegacyVolumeLabelmapPlan({
      config,
      isVolumeImageMapper,
      renderMode,
      segmentation,
      segmentationId,
      useSliceRendering,
      viewport,
    });
  }

  return createStackImageLabelmapPlan({
    isVolumeImageMapper,
    renderMode,
    segmentationId,
    useSliceRendering,
    viewport,
  });
}

export { resolveLabelmapRenderPlan };
