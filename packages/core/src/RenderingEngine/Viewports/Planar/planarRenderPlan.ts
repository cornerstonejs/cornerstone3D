import RenderBackends from '../../../enums/RenderBackends';
import {
  getRenderBackendForRenderMode,
  getRenderPlanSliceForRenderMode,
  getRenderSurfaceForRenderMode,
} from '../../helpers/renderBackendRegistry';
import type { BindingRole } from '../ViewportArchitectureTypes';
import type {
  PlanarEffectiveRenderMode,
  RenderPlanLayer,
  RenderPlanReason,
} from './PlanarViewportTypes';

/**
 * The entry of one layer of a render plan. `slice` is the slot of
 * `registerRenderBackend()` that holds the render mode, `draw` follows the
 * surface of its backend, and `backend` is that backend. A mode that no
 * backend registered reads as a frame drawn by the GPU backend, as the
 * surface of such a mode defaults to the vtk.js canvas.
 */
export function createRenderPlanLayer(
  displaySetId: string,
  role: BindingRole,
  renderMode: PlanarEffectiveRenderMode,
  reason: RenderPlanReason
): RenderPlanLayer {
  return {
    displaySetId,
    role,
    slice: getRenderPlanSliceForRenderMode(renderMode) ?? 'frame',
    draw: getRenderSurfaceForRenderMode(renderMode) === 'cpu' ? 'cpu' : 'gpu',
    backend: getRenderBackendForRenderMode(renderMode) ?? RenderBackends.GPU,
    reason,
  };
}

/** Whether two entries of a render plan say the same. */
export function isSameRenderPlanLayer(
  a: RenderPlanLayer | undefined,
  b: RenderPlanLayer | undefined
): boolean {
  return (
    a?.displaySetId === b?.displaySetId &&
    a?.role === b?.role &&
    a?.slice === b?.slice &&
    a?.draw === b?.draw &&
    a?.backend === b?.backend &&
    a?.reason === b?.reason
  );
}
