import {
  applyPlanarICameraToRenderer,
  derivePlanarPresentation,
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
 */
export const planarProjection = {
  adapter: planarProjectionAdapter,
  getSnapshot: getPlanarProjectionSnapshot,
  getZoom: getPlanarProjectionZoom,
  getScale: getPlanarProjectionScale,
  getPan: getPlanarProjectionPan,
  resolveICamera: resolvePlanarICamera,
  derivePresentation: derivePlanarPresentation,
  applyToRenderer: applyPlanarICameraToRenderer,
  createImageSliceBasis: createPlanarImageSliceBasis,
  createVolumeSliceBasis: createPlanarVolumeSliceBasis,
};
export type {
  PlanarProjectionPresentation,
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
  PlanarDataPresentation,
  PlanarOrientation,
  PlanarPresentationProps,
  PlanarProperties,
  PlanarRenderMode,
  PlanarSetDataOptions,
  PlanarViewportInput,
  PlanarViewportInputOptions,
  PlanarDisplayArea,
  PlanarViewPresentation,
  PlanarViewPresentationSelector,
  PlanarSliceState,
  PlanarResolvedICamera,
} from './PlanarViewportTypes';
