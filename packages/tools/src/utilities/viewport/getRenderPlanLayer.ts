import type { RenderPlanLayer, Types } from '@cornerstonejs/core';

type RenderPlanViewport = Types.IViewport & {
  getRenderPlan?: () => RenderPlanLayer[];
  getSourceDisplaySetId?: () => string | undefined;
};

/**
 * The layer of `viewport.getRenderPlan()` that draws a display set, such as
 * the `displaySetId` of an actor entry. Undefined on a viewport that has no
 * render plan (only a planar viewport has one), and for a display set that the
 * viewport does not show.
 */
function getRenderPlanLayer(
  viewport: Types.IViewport,
  displaySetId: string | undefined
): RenderPlanLayer | undefined {
  if (!displaySetId) {
    return;
  }

  return (viewport as RenderPlanViewport)
    .getRenderPlan?.()
    .find((layer) => layer.displaySetId === displaySetId);
}

/**
 * The layer of `viewport.getRenderPlan()` of the source display set of a
 * planar viewport. Undefined on a viewport that has no render plan, or no
 * source.
 */
function getSourceRenderPlanLayer(
  viewport: Types.IViewport
): RenderPlanLayer | undefined {
  const planarViewport = viewport as RenderPlanViewport;
  const plan = planarViewport.getRenderPlan?.();

  if (!plan) {
    return;
  }

  const sourceDisplaySetId = planarViewport.getSourceDisplaySetId?.();

  return sourceDisplaySetId
    ? plan.find((layer) => layer.displaySetId === sourceDisplaySetId)
    : plan.find((layer) => layer.role === 'source');
}

/**
 * Whether a layer draws a slice of a volume on the GPU, as a `vtkImageSlice`:
 * cut on the GPU from the 3D texture (`gpuVolume`) or cut on the CPU (`cpu`).
 */
function isGpuDrawnVolumeSlice(layer: RenderPlanLayer | undefined): boolean {
  return layer?.draw === 'gpu' && layer.slice !== 'frame';
}

export { getRenderPlanLayer, getSourceRenderPlanLayer, isGpuDrawnVolumeSlice };
