import { getRenderingEngines } from './RenderingEngine/getRenderingEngine';
let csRenderInitialized = false;
import deepMerge from './utilities/deepMerge';
import type { Cornerstone3DConfig, LossyDownsampling } from './types';
import CentralizedWebWorkerManager from './webWorkerManager/webWorkerManager';
import { getRenderingCapabilities } from './utilities/renderingCapabilities';
import triggerEvent from './utilities/triggerEvent';
import eventTarget from './eventTarget';
import {
  Events,
  RenderBackends,
  RenderingEngineModeEnum,
  ViewportType,
  VoxelManagerEnum,
} from './enums';
import type { RenderBackendValue } from './enums';
import { isRegisteredRenderBackend } from './RenderingEngine/helpers/renderBackendRegistry';
import type { EffectiveRenderBackend } from './types/RenderBackendRegistry';
import { coreLog } from './utilities/logger';

const log = coreLog.getLogger('init');

// TODO: change config into a class with methods to better control get/set
const defaultConfig: Cornerstone3DConfig = {
  isMobile: false, // is mobile device
  dangerouslyDisableFidelityIndicator: false,
  rendering: {
    // GPU rendering options
    preferSizeOverAccuracy: false,
    // Use new method by default for accurate full-width display
    useLegacyCameraFOV: false,
    strictZSpacingForVolumeViewport: true,
    sliceStepMeasure: 'l2',
    /**
     * The rendering engine mode to use.
     * 'contextPool' is the a rendering engine that uses sequential rendering, pararllization and has enhanced support/performance for multi-monitor and high resolution displays.
     * 'tiled' is a rendering engine that uses tiled rendering.
     */
    renderingEngineMode: RenderingEngineModeEnum.ContextPool,

    /**
     * The number of WebGL contexts to create. This is used for parallel rendering.
     * The default value is 7, which is suitable for mobile/desktop.
     */
    webGlContextCount: 7,
    planar: {
      /**
       * Render backend for planar viewports: 'gpu' | 'cpu' pin the
       * backend, 'auto' resolves it from capability detection at init().
       * See setRenderBackend().
       */
      renderBackend: RenderBackends.Auto,
      sliceFirst: true,
      cpuVolume: {
        useViewportSamplingForLinear: true,
        volumeModifiedThrottleMs: 5000,
      },
    },
    volumeRendering: {
      /** Multiplier for the calculated sample distance */
      sampleDistanceMultiplier: 1,
    },
    lossyDownsampling: {
      final: false,
      interactive: true,
      interleavedLoading: true,
    },
  },

  segmentation: {
    /**
     * Labelmaps get a full frame buffer unless a host opts into RLE, which
     * changes what its own code reads out of a labelmap (see the type docs).
     */
    labelmapVoxelRepresentation: VoxelManagerEnum.Volume,
  },

  debug: {
    /**
     * Wether or not to show the stats overlay for debugging purposes, stats include:
     * - FPS Frames rendered in the last second. The higher the number the better.
     * - MS Milliseconds needed to render a frame. The lower the number the better.
     * - MB MBytes of allocated memory. (Run Chrome with --enable-precise-memory-info)
     */
    statsOverlay: false,
    fidelityIndicatorDebug: false,
  },

  /**
   * Imports peer modules.
   * This may just fallback to the default import, but many packaging
   * systems don't deal with peer imports properly.
   */
  peerImport: (moduleId) => null,
};

let config: Cornerstone3DConfig = {
  ...defaultConfig,
  rendering: { ...defaultConfig.rendering },
  segmentation: { ...defaultConfig.segmentation },
};

let webWorkerManager: CentralizedWebWorkerManager | null = null;

/** Set by init() when the device has no WebGL. */
let webGLUnavailable = false;

function _hasNorm16TextureSupport() {
  const capabilities = getRenderingCapabilities();
  return capabilities.norm16 && capabilities.norm16Linear;
}

function isIOS() {
  if (/iPad|iPhone|iPod/.test(navigator.platform)) {
    return true;
  } else {
    return (
      navigator.maxTouchPoints &&
      navigator.maxTouchPoints > 2 &&
      navigator.platform.includes('MacIntel')
    );
  }
}

/**
 * Initialize the cornerstone-core. This function runs the GPU capability
 * detection (WebGL2 availability, texture-format probes -- cached across page
 * loads, see `getRenderingCapabilities`) which the 'auto' render backend and
 * texture-format decisions resolve against.
 *
 * If no WebGL2 context is available, rendering falls back to the CPU for
 * supported operations.
 *
 * @param configuration - A configuration object
 * @returns true if cornerstone has been initialized successfully.
 * @category Initialization
 */
function init(configuration = config): boolean {
  if (csRenderInitialized) {
    return csRenderInitialized;
  }

  // merge configs
  config = deepMerge(defaultConfig, configuration);

  // mobile safe
  if (config.isMobile) {
    config.rendering.webGlContextCount = 1;
  }

  if (isIOS()) {
    if (configuration.rendering?.preferSizeOverAccuracy) {
      config.rendering.preferSizeOverAccuracy = true;
    } else if (!_hasNorm16TextureSupport()) {
      log.info(
        'norm16 texture not supported, you can turn on the preferSizeOverAccuracy flag to use native data type, but be aware of the inaccuracy of the rendering in high bits'
      );
    }
  }

  const capabilities = getRenderingCapabilities();
  webGLUnavailable = !capabilities.webgl;
  if (webGLUnavailable) {
    log.info('CornerstoneRender: GPU not detected, using CPU rendering');
  } else {
    log.info('CornerstoneRender: using GPU rendering');

    if (capabilities.softwareRasterizer) {
      log.info(
        `CornerstoneRender: software rasterizer detected (${capabilities.renderer}), GPU rendering may be slow`
      );
    }
  }

  csRenderInitialized = true;

  if (!webWorkerManager) {
    webWorkerManager = new CentralizedWebWorkerManager();
  }

  return csRenderInitialized;
}

/**
 * Whether norm16 (16-bit normalized integer) textures are usable, based on
 * the probed capability profile.
 */
function getCanUseNorm16Texture(): boolean {
  return _hasNorm16TextureSupport();
}

/**
 * Returns the configured render backend preference for planar
 * BaseViewport-based viewports ('auto' | 'gpu' | 'cpu' | a backend
 * registered via `registerRenderBackend()`), stored at
 * `rendering.planar.renderBackend`. Use {@link getEffectiveRenderBackend}
 * for the resolved concrete-backend decision.
 * @category Initialization
 */
function getRenderBackend(): RenderBackendValue {
  return config.rendering.planar?.renderBackend ?? RenderBackends.Auto;
}

/**
 * Whether init() found no WebGL on this device. The rendering engines then
 * make no WebGL context, and the 'auto' render backend draws on the CPU. It
 * is the decision of the library: an application that wants the CPU on a
 * device with WebGL sets `rendering.planar.renderBackend` to 'cpu'.
 * @internal
 */
function isWebGLUnavailable(): boolean {
  return webGLUnavailable;
}

/**
 * Resolves the 'auto' backend: CPU when init() found no WebGL on the device
 * or a WebGL context was lost (`recordLostContext`), and GPU otherwise.
 * Exposed for per-display-set `renderBackend: 'auto'` overrides, which
 * resolve against this regardless of the configured global pin.
 * @category Initialization
 */
function resolveAutoRenderBackend(): EffectiveRenderBackend {
  return isWebGLUnavailable() || drawsOnCpuAfterLostContext()
    ? RenderBackends.CPU
    : RenderBackends.GPU;
}

let lostContext = false;

/**
 * Whether 'auto' draws on the CPU because a WebGL context was lost and did
 * not come back (`recordLostContext`). Only with slice first on, so nothing
 * changes with it off.
 */
function drawsOnCpuAfterLostContext(): boolean {
  return lostContext && isSliceFirstOn();
}

/**
 * Whether slice first is on (`rendering.planar.sliceFirst`). It is on unless
 * the configuration turns it off, so a configuration that does not name it
 * keeps the default.
 */
function isSliceFirstOn(): boolean {
  return config.rendering?.planar?.sliceFirst !== false;
}

/**
 * Records that a WebGL context was lost and did not come back in time. With
 * slice first on, the 'auto' render backend then draws on the CPU, and the
 * planar next viewports run their render path decision again. It stays so
 * until {@link retryGpu} or a new page load.
 * @internal
 */
function recordLostContext(): void {
  if (lostContext) {
    return;
  }

  lostContext = true;
  log.warn(
    'a WebGL context was lost and did not come back; with slice first on, the auto render backend draws on the CPU'
  );

  if (drawsOnCpuAfterLostContext()) {
    _updateRenderingPipelinesForAllViewports(isPlanarNextViewport);
  }
}

/**
 * Whether 'auto' draws on the CPU now because a WebGL context was lost
 * (`recordLostContext`).
 * @internal
 */
function hasLostContext(): boolean {
  return drawsOnCpuAfterLostContext();
}

/**
 * Returns the effective render backend for BaseViewport-based viewports:
 * the configured concrete-backend pin (any backend registered via
 * `registerRenderBackend()`, e.g. 'gpu' or 'cpu'), or the resolved 'auto'
 * decision.
 *
 * Pass `override` to resolve a per-mount `renderBackend` option with the same
 * precedence: a registered backend pins the result, 'auto' resolves from
 * capability detection even when the global backend is pinned, and undefined
 * falls back to the global configuration.
 * @category Initialization
 */
const warnedUnregisteredBackends = new Set<string>();

function getEffectiveRenderBackend(
  override?: RenderBackendValue
): EffectiveRenderBackend {
  const backend = override ?? getRenderBackend();

  if (backend !== RenderBackends.Auto) {
    if (isRegisteredRenderBackend(backend)) {
      return backend as EffectiveRenderBackend;
    }

    // setRenderBackend() rejects unknown values, but a typo in
    // init(configuration) or an override selected before its backend is
    // registered would otherwise be silently downgraded to 'auto'.
    if (!warnedUnregisteredBackends.has(backend)) {
      warnedUnregisteredBackends.add(backend);
      log.warn(
        `[getEffectiveRenderBackend] Unregistered render backend "${backend}"; ` +
          `falling back to 'auto'. Register custom backends with registerRenderBackend().`
      );
    }
  }

  return resolveAutoRenderBackend();
}

/**
 * Sets the global render backend for BaseViewport-based viewports and
 * live-switches all mounted viewports to the new backend in place: viewport
 * ids, mounted data, cameras, presentation state and tool annotations are
 * preserved; only the render paths are rebuilt. The switch is reversible in
 * both directions at runtime.
 *
 * Cornerstone never switches backends on its own. Applications listening to
 * the degradation events (WEBGL_CONTEXT_LOST, RENDER_PATH_ERROR) are expected
 * to call this, typically after prompting the user.
 *
 * Emits RENDER_BACKEND_CHANGED on the eventTarget when the value changes.
 *
 * @param backend - 'auto' or any backend registered via
 * `registerRenderBackend()` (built-ins: 'gpu' | 'cpu')
 * @param reason - Optional human-readable reason carried on the change event
 * (e.g. 'webgl-context-lost').
 * @category Initialization
 */
function setRenderBackend(backend: RenderBackendValue, reason?: string): void {
  if (backend !== RenderBackends.Auto && !isRegisteredRenderBackend(backend)) {
    throw new Error(
      `[setRenderBackend] Invalid render backend: ${String(backend)}. ` +
        `Register custom backends with registerRenderBackend() before selecting them.`
    );
  }

  const previous = getRenderBackend();

  if (previous === backend) {
    return;
  }

  // Replace (not mutate) the planar object: before init() it may still be
  // the shared defaultConfig reference. Unlike the deprecated toggles, this
  // must NOT mark the library initialized: a pre-init call would otherwise
  // turn the later init(configuration) into a no-op, silently dropping the
  // user's configuration and the no-WebGL CPU fallback.
  config.rendering.planar = {
    ...config.rendering.planar,
    renderBackend: backend,
  };
  _updateRenderingPipelinesForAllViewports();

  triggerEvent(eventTarget, Events.RENDER_BACKEND_CHANGED, {
    previous,
    current: backend,
    effectiveBackend: getEffectiveRenderBackend(),
    reason,
  });
}

/**
 * Turns slice first on or off for planar viewports (see
 * `rendering.planar.sliceFirst`): a volume-backed display set cuts the visible
 * slice on the CPU and draws it as a 2D image in place of a 3D texture. The
 * mounted planar next viewports (`ViewportType.PLANAR`, the legacy
 * adapters among them) run their render path decision again, and display
 * sets whose render mode changes are remounted in place. Legacy viewports are
 * not touched, since slice first does not apply to them. A per-display-set
 * `sliceFirst` option still wins. Like setRenderBackend, this does not mark the
 * library initialized, so a later init(configuration) still runs.
 *
 * Slice first also decides whether the loaders keep float data as floats on
 * a GPU that cannot filter float textures (see `canRenderFloatTextures`). A
 * volume keeps the array type it was created with, so turn slice first on
 * before the volumes are created to get PT in SUV on such a device.
 *
 * @param enabled - true to turn slice first on
 * @experimental
 * @category Initialization
 */
function setSliceFirst(enabled: boolean): void {
  if (isSliceFirstOn() === enabled) {
    return;
  }

  config.rendering.planar = {
    ...config.rendering.planar,
    sliceFirst: enabled,
  };
  _updateRenderingPipelinesForAllViewports(
    (viewport) => viewport.type === ViewportType.PLANAR
  );
}

const failedVolumeTextureIds = new Set<string>();

/** Whether a viewport is a planar next viewport, the one the router serves. */
function isPlanarNextViewport(viewport: { type: string }): boolean {
  return viewport.type === ViewportType.PLANAR;
}

/**
 * Records that the 3D texture of a volume failed on this page, and runs the
 * render path decision of the planar next viewports again after the current
 * task, so no remount starts inside a render. With slice first on, the
 * router then samples the slabs of that volume on the CPU. The record stays
 * until {@link retryGpu} or a new page load.
 *
 * @param volumeId - the volume whose 3D texture failed
 * @internal
 */
function recordVolumeTextureFailure(volumeId: string): void {
  if (!volumeId || failedVolumeTextureIds.has(volumeId)) {
    return;
  }

  failedVolumeTextureIds.add(volumeId);
  log.warn(
    `the 3D texture of the volume ${volumeId} failed; with slice first on, its slabs are sampled on the CPU`
  );
  setTimeout(() => {
    _updateRenderingPipelinesForAllViewports(isPlanarNextViewport);
  }, 0);
}

/**
 * Whether the 3D texture of a volume failed on this page
 * (`recordVolumeTextureFailure`).
 * @internal
 */
function hasVolumeTextureFailed(volumeId: string | undefined): boolean {
  return !!volumeId && failedVolumeTextureIds.has(volumeId);
}

/**
 * Lets the GPU try again what failed on this page: forgets every 3D texture
 * that failed and a WebGL context that was lost and did not come back, and
 * runs the render path decision of the planar next viewports again, so a
 * layer that moved to the CPU for one of these reasons goes back to the GPU.
 * Cornerstone never does this by itself.
 *
 * @experimental
 * @category Initialization
 */
function retryGpu(): void {
  failedVolumeTextureIds.clear();
  lostContext = false;
  _updateRenderingPipelinesForAllViewports(isPlanarNextViewport);
}

function setPreferSizeOverAccuracy(status: boolean): void {
  config.rendering.preferSizeOverAccuracy = status;
  csRenderInitialized = true;
  _updateRenderingPipelinesForAllViewports();
}

/**
 * Whether float data can be drawn, so that the loaders keep values that are
 * not whole numbers after scaling (PT in SUV) as 32-bit floats. That is true
 * when the GPU can filter float textures linearly (`floatLinear` of the
 * capability profile), and also when slice first is on
 * (`rendering.planar.sliceFirst`): a planar viewport then cuts a slice on the
 * CPU and draws it from a 2D texture that the device can draw, and a layer
 * that would need a float 3D texture keeps its slab on the CPU too. A float
 * volume that still ends in a 3D texture on such a device (a legacy or 3D
 * viewport) is drawn with nearest filtering. When this is false, the loaders
 * keep the stored integer values unscaled.
 *
 * Environments where the probe cannot run (no WebGL2 context, e.g. unit
 * tests) keep the legacy user-agent behavior so data-preparation code paths
 * stay deterministic there.
 */
function canRenderFloatTextures(): boolean {
  const capabilities = getRenderingCapabilities();

  if (capabilities.webgl) {
    return capabilities.floatLinear || isSliceFirstOn();
  }

  return !isIOS();
}

/**
 *
 * Returns whether or not cornerstone-core has been initialized.
 * @returns true if the cornerstone render has been initialized.
 * @category Initialization
 *
 */
function isCornerstoneInitialized(): boolean {
  return csRenderInitialized;
}

function resetInitialization(): void {
  csRenderInitialized = false;
}

/**
 * This function returns a copy of the config object. This is used to prevent the
 * config object from being modified by other parts of the program.
 * @returns A copy of the config object.
 */
function getConfiguration(): Cornerstone3DConfig {
  // return a copy
  // return JSON.parse(JSON.stringify(config));
  return config;
}

function setConfiguration(c: Cornerstone3DConfig) {
  config = c;
  _updateRenderingPipelinesForAllViewports();
}

/**
 * Update rendering pipelines for all viewports in all rendering engines.
 * Viewport families that do not support a live pipeline swap simply omit the
 * hook.
 * @param shouldUpdate - when given, only the viewports it accepts are updated
 * @returns {void}
 * @category Initialization
 */
function _updateRenderingPipelinesForAllViewports(
  shouldUpdate?: (viewport: { type: string }) => boolean
): void {
  getRenderingEngines().forEach((engine) => {
    engine.getViewports().forEach((viewport) => {
      if (shouldUpdate && !shouldUpdate(viewport)) {
        return;
      }

      viewport.updateRenderingPipeline?.();
    });
  });
}

function getWebWorkerManager() {
  if (!webWorkerManager) {
    webWorkerManager = new CentralizedWebWorkerManager();
  }

  return webWorkerManager;
}

/**
 * The lossy downsampling that the viewer may use, with the defaults filled in.
 * See `rendering.lossyDownsampling` of the configuration.
 */
function getLossyDownsampling(): Required<LossyDownsampling> {
  return {
    ...(defaultConfig.rendering
      .lossyDownsampling as Required<LossyDownsampling>),
    ...config.rendering?.lossyDownsampling,
  };
}

/**
 * Turns kinds of lossy downsampling on or off. A kind that `change` omits keeps
 * its value. Each viewport that draws a volume then chooses its texture
 * again.
 */
function setLossyDownsampling(change: LossyDownsampling): void {
  config.rendering = {
    ...config.rendering,
    lossyDownsampling: { ...getLossyDownsampling(), ...change },
  };
  triggerEvent(eventTarget, Events.VOLUME_TEXTURE_LIMITS_CHANGED);
}

async function peerImport(moduleId: string) {
  return config.peerImport(moduleId);
}

export {
  init,
  isWebGLUnavailable,
  isCornerstoneInitialized,
  setPreferSizeOverAccuracy,
  getRenderBackend,
  setRenderBackend,
  setSliceFirst,
  retryGpu,
  recordVolumeTextureFailure,
  recordLostContext,
  hasLostContext,
  hasVolumeTextureFailed,
  getEffectiveRenderBackend,
  resolveAutoRenderBackend,
  getConfiguration,
  setConfiguration,
  getLossyDownsampling,
  setLossyDownsampling,
  getWebWorkerManager,
  canRenderFloatTextures,
  peerImport,
  resetInitialization,
  getCanUseNorm16Texture,
};
