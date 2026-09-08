import * as renderBackendSdk from '../src/renderBackend';

/**
 * The `@cornerstonejs/core/renderBackend` subpath is the contract an
 * out-of-tree render backend compiles against. This locks the surface so an
 * export cannot be dropped or renamed without a deliberate change here.
 *
 * The list is derived from what the WebGPU render paths in #2796 deep-imported
 * from core internals — i.e. the set that had to become public for a backend
 * to live in its own package rather than in the core tree.
 */
const REQUIRED_FUNCTIONS = [
  // Backend registration and render-mode queries
  'registerRenderBackend',
  'isRegisteredRenderBackend',
  'getRenderBackendDefinition',
  'getRenderModeForBackend',
  'getRenderBackendForRenderMode',
  'getRenderSurfaceForRenderMode',
  'isImageRenderMode',
  'isVolumeRenderMode',
  'renderModeSupportsOverlayActors',
  'renderModeUsesVtkActors',
  'createRegisteredPlanarRenderPaths',
  // Actor and image data construction
  'buildPlanarActorEntry',
  'buildPlanarImageData',
  'createEmptyVTKImageData',
  'createVTKImageDataFromImage',
  'updateVTKImageDataGeometryFromImage',
  'createPlanarRGBTransferFunction',
  // Presentation
  'applyPlanarImagePresentation',
  'applyPlanarVolumePresentation',
  'getDefaultImageVOIRange',
  'setDefaultVolumeVOI',
  // Camera
  'applyPlanarCameraViewState',
  'applyPlanarICameraToActor',
  'applyPlanarICameraToRenderer',
  'derivePlanarPresentation',
  'getPlanarCameraState',
  'resolvePlanarICamera',
  'setPlanarVolumeCameraClippingRange',
  'updatePlanarVolumeClippingPlanes',
  // Projection
  'canvasToWorldPlanarRenderPathProjection',
  'worldToCanvasPlanarRenderPathProjection',
  'getPlanarRenderPathActiveSourceICamera',
  'resolvePlanarRenderPathCurrentImageIdIndex',
  'resolvePlanarRenderPathProjection',
  // Slice geometry
  'createPlanarImageSliceBasis',
  'createPlanarVolumeSliceBasis',
  'resolvePlanarVolumeImageIdIndex',
  // Lifecycle events
  'triggerPlanarNewImage',
  'triggerPlanarVolumeNewImage',
];

describe('renderBackend SDK surface', () => {
  it('exports every function a planar render backend needs', () => {
    const missing = REQUIRED_FUNCTIONS.filter(
      (name) => typeof renderBackendSdk[name] !== 'function'
    );

    expect(missing).toEqual([]);
  });

  it('does not leak a default export', () => {
    // A barrel with a default export invites `import sdk from '...'`, which
    // then breaks when the barrel gains named-only exports.
    expect(renderBackendSdk.default).toBeUndefined();
  });

  it('registers a backend through the SDK entry point alone', () => {
    // The end-to-end point of the subpath: a package that imports only from
    // here can register a working backend.
    const { registerRenderBackend, isRegisteredRenderBackend } =
      renderBackendSdk;

    registerRenderBackend({
      backend: 'test:sdk-only',
      renderModes: {
        image: { id: 'test:sdkOnlyImage' },
        volume: { id: 'test:sdkOnlyVolume', supportsOverlayActors: false },
      },
      surface: 'cpu',
    });

    expect(isRegisteredRenderBackend('test:sdk-only')).toBe(true);
    expect(renderBackendSdk.isImageRenderMode('test:sdkOnlyImage')).toBe(true);
    expect(
      renderBackendSdk.renderModeSupportsOverlayActors('test:sdkOnlyVolume')
    ).toBe(false);
  });
});
