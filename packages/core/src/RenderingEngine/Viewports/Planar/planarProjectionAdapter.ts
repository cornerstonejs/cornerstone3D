import type vtkRenderer from '@kitware/vtk.js/Rendering/Core/Renderer';
import { ViewportType } from '../../../enums';
import type { ViewFramingSelector } from '../../../types/IViewport';
import type {
  ProjectionWriteOptions,
  ViewportProjectionAdapter,
} from '../ViewportProjectionTypes';
import type {
  PlanarResolvedICamera,
  PlanarViewState,
} from './PlanarViewportTypes';
import { applyPlanarICameraToRenderer } from './planarRenderCamera';
import {
  getPlanarProjectionFraming,
  withPlanarProjectionFraming,
} from './planarProjectionFraming';
import {
  getPlanarProjectionPan,
  getPlanarProjectionScale,
  getPlanarProjectionSnapshot,
  getPlanarProjectionZoom,
} from './planarProjectionSnapshot';
import {
  PLANAR_PROJECTION_ID,
  type PlanarProjectionRequest,
  type PlanarProjectionSnapshot,
  type PlanarProjectionAdapterFraming,
} from './PlanarProjectionTypes';

export {
  getPlanarProjectionPan,
  getPlanarProjectionScale,
  getPlanarProjectionSnapshot,
  getPlanarProjectionZoom,
};
export type {
  PlanarProjectionFraming,
  PlanarProjectionRequest,
  PlanarProjectionSnapshot,
} from './PlanarProjectionTypes';

/**
 * Identifies VTK renderers as valid Planar renderer-application targets.
 */
function isVtkRenderer(target: unknown): target is vtkRenderer {
  return Boolean(
    target &&
      typeof target === 'object' &&
      'getActiveCamera' in target &&
      typeof (target as vtkRenderer).getActiveCamera === 'function'
  );
}

/**
 * Planar projection adapter.
 *
 * Snapshot construction, framing compatibility, and reverse projection
 * are intentionally delegated to focused modules so this file remains the
 * adapter seam rather than the full implementation.
 */
export const planarProjectionAdapter: ViewportProjectionAdapter<
  PlanarViewState,
  PlanarProjectionAdapterFraming,
  PlanarProjectionSnapshot
> = {
  id: PLANAR_PROJECTION_ID,
  viewportTypes: [ViewportType.PLANAR],
  getSnapshot: (request) =>
    getPlanarProjectionSnapshot(request as PlanarProjectionRequest),
  getFraming: (snapshot, selector?: ViewFramingSelector) =>
    getPlanarProjectionFraming(snapshot, selector),
  withFraming: (
    snapshot,
    framing: Partial<PlanarProjectionAdapterFraming>,
    options?: ProjectionWriteOptions
  ) => withPlanarProjectionFraming(snapshot, framing, options),
  applyToRenderer: (snapshot, target) => {
    if (!isVtkRenderer(target)) {
      return;
    }

    applyPlanarICameraToRenderer({
      activeSourceICamera: snapshot.rendererCamera as
        | PlanarResolvedICamera
        | undefined,
      renderer: target,
    });
  },
};
