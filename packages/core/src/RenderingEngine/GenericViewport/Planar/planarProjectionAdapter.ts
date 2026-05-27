import type vtkRenderer from '@kitware/vtk.js/Rendering/Core/Renderer';
import { ViewportType } from '../../../enums';
import type { ViewPresentationSelector } from '../../../types/IViewport';
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
  getPlanarProjectionPresentation,
  withPlanarProjectionPresentation,
} from './planarProjectionPresentation';
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
  type PlanarProjectionAdapterPresentation,
} from './PlanarProjectionTypes';

export {
  getPlanarProjectionPan,
  getPlanarProjectionScale,
  getPlanarProjectionSnapshot,
  getPlanarProjectionZoom,
};
export type {
  PlanarProjectionPresentation,
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
 * Snapshot construction, presentation compatibility, and reverse projection
 * are intentionally delegated to focused modules so this file remains the
 * adapter seam rather than the full implementation.
 */
export const planarProjectionAdapter: ViewportProjectionAdapter<
  PlanarViewState,
  PlanarProjectionAdapterPresentation,
  PlanarProjectionSnapshot
> = {
  id: PLANAR_PROJECTION_ID,
  viewportTypes: [ViewportType.PLANAR_NEXT],
  getSnapshot: (request) =>
    getPlanarProjectionSnapshot(request as PlanarProjectionRequest),
  getPresentation: (snapshot, selector?: ViewPresentationSelector) =>
    getPlanarProjectionPresentation(snapshot, selector),
  withPresentation: (
    snapshot,
    presentation: Partial<PlanarProjectionAdapterPresentation>,
    _options?: ProjectionWriteOptions
  ) => withPlanarProjectionPresentation(snapshot, presentation),
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
