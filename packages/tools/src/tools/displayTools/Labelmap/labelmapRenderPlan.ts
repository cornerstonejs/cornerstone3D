import type { Types } from '@cornerstonejs/core';
import type {
  LabelmapRepresentation,
  Segmentation,
} from '../../../types/SegmentationStateTypes';
import getViewportLabelmapRenderMode, {
  type ViewportLabelmapRenderMode,
} from '../../../stateManagement/segmentation/helpers/getViewportLabelmapRenderMode';
import {
  canRenderVolumeViewportLabelmapAsImage,
  getVolumeViewportLabelmapImageMapperState,
  shouldUseSliceRendering,
} from '../../../stateManagement/segmentation/helpers/labelmapImageMapperSupport';

type LabelmapRenderPlanKind =
  | 'legacy-volume'
  | 'legacy-stack-image'
  | 'volume-slice-image-mapper'
  | 'unsupported';

type LabelmapRenderPlan = {
  kind: LabelmapRenderPlanKind;
  renderMode: ViewportLabelmapRenderMode;
  useSliceRendering: boolean;
  isVolumeImageMapper: boolean;
  unsupportedStateKey?: string;
};

function resolveLabelmapRenderPlan({
  viewport,
  segmentation,
  representation,
}: {
  viewport: Types.IViewport;
  segmentation: Segmentation;
  representation: LabelmapRepresentation;
}): LabelmapRenderPlan {
  const useSliceRendering = shouldUseSliceRendering(
    segmentation,
    representation.config
  );
  const renderMode = getViewportLabelmapRenderMode(viewport, {
    useSliceRendering,
  });
  const isVolumeImageMapper =
    useSliceRendering && canRenderVolumeViewportLabelmapAsImage(viewport);

  if (renderMode === 'unsupported') {
    return {
      kind: 'unsupported',
      renderMode,
      useSliceRendering,
      isVolumeImageMapper,
      unsupportedStateKey: useSliceRendering
        ? getVolumeViewportLabelmapImageMapperState(viewport).key
        : undefined,
    };
  }

  if (isVolumeImageMapper) {
    return {
      kind: 'volume-slice-image-mapper',
      renderMode,
      useSliceRendering,
      isVolumeImageMapper,
    };
  }

  return {
    kind: renderMode === 'volume' ? 'legacy-volume' : 'legacy-stack-image',
    renderMode,
    useSliceRendering,
    isVolumeImageMapper,
  };
}

export { resolveLabelmapRenderPlan };
export type { LabelmapRenderPlan, LabelmapRenderPlanKind };
