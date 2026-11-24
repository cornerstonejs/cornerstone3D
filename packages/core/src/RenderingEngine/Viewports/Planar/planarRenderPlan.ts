import { ActorRenderMode } from '../../../types/IActor';
import {
  getRenderBackendForRenderMode,
  getRenderSurfaceForRenderMode,
  getSampledVolumeRenderModeForBackend,
  isVolumeRenderMode,
} from '../../helpers/renderBackendRegistry';
import type { BindingRole } from '../ViewportArchitectureTypes';
import type {
  PlanarEffectiveRenderMode,
  RenderPlanLayer,
  RenderPlanReason,
} from './PlanarViewportTypes';

/**
 * How the slice of a render mode is made: `cpu` for a mode that samples a
 * volume on the CPU (the CPU volume mode and the sampled volume mode of any
 * backend), `gpuVolume` for any other volume mode, and `frame` for an image
 * mode, which draws the acquired frame.
 */
function getRenderPlanSlice(
  renderMode: PlanarEffectiveRenderMode
): RenderPlanLayer['slice'] {
  if (!isVolumeRenderMode(renderMode)) {
    return 'frame';
  }

  if (
    renderMode === ActorRenderMode.CPU_VOLUME ||
    renderMode ===
      getSampledVolumeRenderModeForBackend(
        getRenderBackendForRenderMode(renderMode)
      )
  ) {
    return 'cpu';
  }

  return 'gpuVolume';
}

/** The entry of one layer of a render plan. */
export function createRenderPlanLayer(
  dataId: string,
  role: BindingRole,
  renderMode: PlanarEffectiveRenderMode,
  reason: RenderPlanReason
): RenderPlanLayer {
  return {
    dataId,
    role,
    slice: getRenderPlanSlice(renderMode),
    draw: getRenderSurfaceForRenderMode(renderMode) === 'cpu' ? 'cpu' : 'gpu',
    renderMode,
    reason,
  };
}

/** Whether two entries of a render plan say the same. */
export function isSameRenderPlanLayer(
  a: RenderPlanLayer | undefined,
  b: RenderPlanLayer | undefined
): boolean {
  return (
    a?.dataId === b?.dataId &&
    a?.role === b?.role &&
    a?.renderMode === b?.renderMode &&
    a?.reason === b?.reason
  );
}
