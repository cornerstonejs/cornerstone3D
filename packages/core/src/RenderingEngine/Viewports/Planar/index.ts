import {
  applyPlanarICameraToRenderer,
  derivePlanarFraming,
  resolvePlanarICamera,
} from './planarRenderCamera';
import {
  getPlanarProjectionPan,
  getPlanarProjectionScale,
  getPlanarProjectionSnapshot,
  getPlanarProjectionZoom,
  planarProjectionAdapter,
} from './planarProjectionAdapter';
import {
  createPlanarImageSliceBasis,
  createPlanarVolumeSliceBasis,
} from './planarSliceBasis';

export { DefaultPlanarDataProvider } from './DefaultPlanarDataProvider';
export {
  createDefaultPlanarRenderPaths,
  createPlanarRenderPathResolver,
} from './PlanarRenderPathResolver';
/**
 * Lower-level planar projection helpers for custom synchronizers and tooling
 * that need resolved snapshots or renderer cameras without going through a
 * viewport method.
 * These are advertised as a tier below the core viewport API — signatures
 * may change before 3.0 stable.
 *
 * @experimental Advanced helper namespace; prefer `viewportProjection` for
 * stable application-level framing reads and writes.
 */
export const planarProjection = {
  adapter: planarProjectionAdapter,
  getSnapshot: getPlanarProjectionSnapshot,
  getZoom: getPlanarProjectionZoom,
  getScale: getPlanarProjectionScale,
  getPan: getPlanarProjectionPan,
  resolveICamera: resolvePlanarICamera,
  deriveFraming: derivePlanarFraming,
  applyToRenderer: applyPlanarICameraToRenderer,
  createImageSliceBasis: createPlanarImageSliceBasis,
  createVolumeSliceBasis: createPlanarVolumeSliceBasis,
};
export type {
  PlanarProjectionFraming,
  PlanarProjectionRequest,
  PlanarProjectionSnapshot,
} from './planarProjectionAdapter';
export {
  BasePlanarResolvedView,
  PlanarStackResolvedView,
  PlanarVolumeResolvedView,
  resolvePlanarStackImageIdIndex,
} from './PlanarResolvedView';
export { resolvePlanarRenderPathProjection } from './planarRenderPathProjection';
export { default, default as PlanarViewport } from './PlanarViewport';
export type { PlanarSliceBasis } from './planarSliceBasis';
export type {
  PlanarViewState,
  PlanarDisplaySetAppearance,
  PlanarOrientation,
  PlanarAppearanceProps,
  PlanarProperties,
  PlanarSetDataOptions,
  PlanarViewportInput,
  PlanarViewportInputOptions,
  PlanarDisplayArea,
  PlanarViewFraming,
  PlanarViewFramingSelector,
  PlanarSliceState,
  PlanarResolvedICamera,
  RenderPlanChangedEventDetail,
  RenderPlanDraw,
  RenderPlanLayer,
  RenderPlanReason,
  RenderPlanSlice,
} from './PlanarViewportTypes';
