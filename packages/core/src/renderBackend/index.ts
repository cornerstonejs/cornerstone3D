/**
 * Render-backend authoring SDK.
 *
 * Everything an out-of-tree render backend needs to implement planar render
 * paths and register itself, in one entry point:
 * `@cornerstonejs/core/renderBackend`.
 *
 * This exists so a renderer can live in its own package rather than inside
 * core. Before it, the building blocks a render path needs — actor entry
 * construction, camera application, projection resolution, presentation
 * application, image data construction, the mounted-rendering shapes — were
 * reachable only by deep-importing core internals, which meant every backend
 * had to be developed in-tree.
 *
 * @experimental This is a tier below the application-facing viewport API, on
 * the same footing as `registerRenderBackend()` itself: it is the surface a
 * backend implementor consumes, and it is expected to grow as backends need
 * more of the render-path contract (notably backend-owned surfaces and
 * participation in `auto` backend resolution). Signatures here may change in
 * a minor release. Applications that only *use* viewports should import from
 * `@cornerstonejs/core` instead — nothing here is needed to display an image.
 *
 * @example Registering a backend from its own package
 * ```ts
 * import {
 *   registerRenderBackend,
 *   type RenderPath,
 *   type RenderPathDefinition,
 * } from '@cornerstonejs/core/renderBackend';
 *
 * export function registerMyRenderBackend(): void {
 *   registerRenderBackend({
 *     backend: 'myOrg:webgpu',
 *     renderModes: {
 *       image: {
 *         id: 'myOrg:webgpuImage',
 *         createDefinition: () => new MyImagePath(),
 *       },
 *     },
 *   });
 * }
 * ```
 */

// ---------------------------------------------------------------------------
// Backend registration
// ---------------------------------------------------------------------------

export {
  registerRenderBackend,
  isRegisteredRenderBackend,
  getRenderBackendDefinition,
  getRenderModeForBackend,
  getRenderBackendForRenderMode,
  getRenderSurfaceForRenderMode,
  isImageRenderMode,
  isVolumeRenderMode,
  renderModeSupportsOverlayActors,
  renderModeUsesVtkActors,
  createRegisteredPlanarRenderPaths,
} from '../RenderingEngine/helpers/renderBackendRegistry';

export type {
  RegisterRenderBackendOptions,
  RenderBackendDefinition,
  RenderBackendRenderMode,
  RenderBackendRenderModes,
  RenderBackendDataKind,
  RenderSurface,
} from '../RenderingEngine/helpers/renderBackendRegistry';

export type {
  EffectiveRenderBackend,
  RenderBackend,
  RenderBackendConstants,
  RenderBackendRegistry,
} from '../types/RenderBackendRegistry';

// ---------------------------------------------------------------------------
// Render path contracts
//
// The viewport-architecture interfaces a render path implements and the
// resolver dispatches on. `RenderPathDefinition.createRenderPath()` is the
// entry point a registered backend's `createDefinition` factory returns.
// ---------------------------------------------------------------------------

export type {
  BaseViewportRenderContext,
  BindingRole,
  DataAddOptions,
  DataProvider,
  DisplaySetId,
  LoadedData,
  MountedRendering,
  RenderPath,
  RenderPathAttachment,
  RenderPathDefinition,
  RenderPathResolver,
  ViewportId,
  ViewportRenderContextType,
} from '../RenderingEngine/GenericViewport/ViewportArchitectureTypes';

// ---------------------------------------------------------------------------
// Planar render path building blocks
// ---------------------------------------------------------------------------

/** Wraps a mounted actor and mapper into the ActorEntry the viewport tracks. */
export { buildPlanarActorEntry } from '../RenderingEngine/GenericViewport/Planar/buildPlanarActorEntry';

/** Builds the CPU-side image data descriptor for a mounted stack image. */
export { buildPlanarImageData } from '../RenderingEngine/GenericViewport/Planar/CpuImageSliceRenderPath';

/**
 * vtkImageData construction and image presentation (VOI, colormap,
 * interpolation, invert) for stack-backed render paths.
 */
export {
  applyPlanarCameraViewState,
  applyPlanarImagePresentation,
  createEmptyVTKImageData,
  createPlanarRGBTransferFunction,
  createVTKImageDataFromImage,
  getDefaultImageVOIRange,
  getPlanarCameraState,
  updateVTKImageDataGeometryFromImage,
} from '../RenderingEngine/helpers/planarImageRendering';

export type {
  PlanarCameraState,
  PlanarImagePresentation,
  PlanarImageViewState,
} from '../RenderingEngine/helpers/planarImageRendering';

/** Applies a resolved planar camera to a vtk renderer or a single actor. */
export {
  applyPlanarICameraToActor,
  applyPlanarICameraToRenderer,
  derivePlanarPresentation,
  resolvePlanarICamera,
  setPlanarVolumeCameraClippingRange,
  updatePlanarVolumeClippingPlanes,
} from '../RenderingEngine/GenericViewport/Planar/planarRenderCamera';

export type { DerivedPlanarPresentation } from '../RenderingEngine/GenericViewport/Planar/planarRenderCamera';

/**
 * Resolves the projection (camera, slice, canvas transforms) a render path
 * should draw, from the viewport's view state and the mounted data.
 */
export {
  canvasToWorldPlanarRenderPathProjection,
  getPlanarRenderPathActiveSourceICamera,
  resolvePlanarRenderPathCurrentImageIdIndex,
  resolvePlanarRenderPathProjection,
  worldToCanvasPlanarRenderPathProjection,
} from '../RenderingEngine/GenericViewport/Planar/planarRenderPathProjection';

export type {
  PlanarRenderPathProjection,
  PlanarRenderPathProjectionCamera,
} from '../RenderingEngine/GenericViewport/Planar/planarRenderPathProjection';

/** Volume-slice presentation (VOI, colormap, blend mode, slab thickness). */
export { applyPlanarVolumePresentation } from '../RenderingEngine/GenericViewport/Planar/planarVolumePresentation';

/** Seeds a volume's default VOI from its modality and scalar range. */
export { default as setDefaultVolumeVOI } from '../RenderingEngine/helpers/setDefaultVolumeVOI';

/** Slice geometry basis shared by the core planar paths. */
export {
  createPlanarImageSliceBasis,
  createPlanarVolumeSliceBasis,
  resolvePlanarVolumeImageIdIndex,
} from '../RenderingEngine/GenericViewport/Planar/planarSliceBasis';

export type { PlanarSliceBasis } from '../RenderingEngine/GenericViewport/Planar/planarSliceBasis';

/**
 * IMAGE_RENDERED / VOLUME_NEW_IMAGE event emission. A render path must emit
 * these so tools and synchronizers see the same lifecycle they see from the
 * core paths.
 */
export {
  triggerPlanarNewImage,
  triggerPlanarVolumeNewImage,
} from '../RenderingEngine/GenericViewport/Planar/planarImageEvents';

// ---------------------------------------------------------------------------
// Planar types
// ---------------------------------------------------------------------------

export type {
  PlanarCpuImageAdapterContext,
  PlanarCpuVolumeAdapterContext,
  PlanarDataPresentation,
  PlanarPayload,
  PlanarResolvedICamera,
  PlanarViewportRenderContext,
  PlanarViewState,
  PlanarVtkImageAdapterContext,
  PlanarVtkVolumeAdapterContext,
} from '../RenderingEngine/GenericViewport/Planar/PlanarViewportTypes';

/**
 * The mounted-rendering shapes the core planar paths produce. A backend's own
 * render mode declares its own shape; these are exported because extension
 * paths that mirror a core path's geometry reuse its rendering shape, and
 * because `PlanarRendering` is the union the viewport narrows on.
 */
export type {
  PlanarCpuImageRendering,
  PlanarCpuVolumeRendering,
  PlanarImageMapperRendering,
  PlanarRendering,
  PlanarVolumeSliceRendering,
} from '../RenderingEngine/GenericViewport/Planar/planarRuntimeTypes';
