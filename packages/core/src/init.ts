import { getRenderingEngines } from './RenderingEngine/getRenderingEngine';
let csRenderInitialized = false;
import deepMerge from './utilities/deepMerge';
import type { Cornerstone3DConfig } from './types';
import CentralizedWebWorkerManager from './webWorkerManager/webWorkerManager';
import {
  getFilterableFloatTexturePrecision,
  getRenderingCapabilities,
} from './utilities/renderingCapabilities';
import triggerEvent from './utilities/triggerEvent';
import eventTarget from './eventTarget';
import { Events, RenderBackends, RenderingEngineModeEnum } from './enums';
import type { RenderBackendValue } from './enums';
import { isRegisteredRenderBackend } from './RenderingEngine/helpers/renderBackendRegistry';
import type { EffectiveRenderBackend } from './types/RenderBackendRegistry';

// TODO: change config into a class with methods to better control get/set
const defaultConfig: Cornerstone3DConfig = {
  isMobile: false, // is mobile device
  rendering: {
    useCPURendering: false,
    // GPU rendering options
    preferSizeOverAccuracy: false,
    // Use new method by default for accurate full-width display
    useLegacyCameraFOV: false,
    strictZSpacingForVolumeViewport: true,
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
       * Render backend for planar GenericViewports: 'gpu' | 'cpu' pin the
       * backend, 'auto' resolves it from capability detection at init() (and
       * the deprecated useCPURendering flag). See setRenderBackend().
       */
      renderBackend: RenderBackends.Auto,
      cpuVolume: {
        useViewportSamplingForLinear: true,
        volumeModifiedThrottleMs: 5000,
      },
    },
    volumeRendering: {
      /** Multiplier for the calculated sample distance */
      sampleDistanceMultiplier: 1,
    },
  },

  debug: {
    /**
     * Wether or not to show the stats overlay for debugging purposes, stats include:
     * - FPS Frames rendered in the last second. The higher the number the better.
     * - MS Milliseconds needed to render a frame. The lower the number the better.
     * - MB MBytes of allocated memory. (Run Chrome with --enable-precise-memory-info)
     */
    statsOverlay: false,
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
};

let webWorkerManager: CentralizedWebWorkerManager | null = null;

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
 * detection (WebGL availability, texture-format probes -- cached across page
 * loads, see `getRenderingCapabilities`) which the 'auto' render backend and
 * texture-format decisions resolve against.
 *
 * If no WebGL context is available, rendering falls back to the CPU for
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
      console.log(
        'norm16 texture not supported, you can turn on the preferSizeOverAccuracy flag to use native data type, but be aware of the inaccuracy of the rendering in high bits'
      );
    }
  }

  const capabilities = getRenderingCapabilities();
  if (!capabilities.webgl) {
    console.log('CornerstoneRender: GPU not detected, using CPU rendering');
    config.rendering.useCPURendering = true;
  } else {
    console.log('CornerstoneRender: using GPU rendering');

    if (capabilities.softwareRasterizer) {
      console.log(
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
 * GenericViewport-based viewports ('auto' | 'gpu' | 'cpu' | a backend
 * registered via `registerRenderBackend()`), stored at
 * `rendering.planar.renderBackend`. Use {@link getEffectiveRenderBackend}
 * for the resolved concrete-backend decision.
 * @category Initialization
 */
function getRenderBackend(): RenderBackendValue {
  return config.rendering.planar?.renderBackend ?? RenderBackends.Auto;
}

/**
 * Resolves the 'auto' backend: CPU when the deprecated useCPURendering flag
 * is set (init() sets it when no WebGL context is available) and GPU
 * otherwise. Exposed for per-display-set `renderBackend: 'auto'` overrides,
 * which resolve against this regardless of the configured global pin.
 * @category Initialization
 */
function resolveAutoRenderBackend(): EffectiveRenderBackend {
  return config.rendering.useCPURendering
    ? RenderBackends.CPU
    : RenderBackends.GPU;
}

/**
 * Returns the effective render backend for GenericViewport-based viewports:
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
      console.warn(
        `[getEffectiveRenderBackend] Unregistered render backend "${backend}"; ` +
          `falling back to 'auto'. Register custom backends with registerRenderBackend().`
      );
    }
  }

  return resolveAutoRenderBackend();
}

/**
 * Sets the global render backend for GenericViewport-based viewports and
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
 * Forces CPU rendering for legacy viewports. The 'auto' render backend also
 * honors this flag, so calling it affects GenericViewport-based viewports
 * unless they are pinned to 'gpu'/'cpu' via renderBackend.
 * @param status - boolean
 * @category Initialization
 * @deprecated Use `setRenderBackend('cpu' | 'auto')` instead.
 */
function setUseCPURendering(status: boolean, updateViewports = true): void {
  const previousEffective = getEffectiveRenderBackend();

  config.rendering.useCPURendering = status;
  csRenderInitialized = true;
  if (updateViewports) {
    _updateRenderingPipelinesForAllViewports();
  }

  _notifyEffectiveBackendChange(previousEffective, 'setUseCPURendering');
}

function setPreferSizeOverAccuracy(status: boolean): void {
  config.rendering.preferSizeOverAccuracy = status;
  csRenderInitialized = true;
  _updateRenderingPipelinesForAllViewports();
}

/**
 * Whether floating-point volume samples can be linearly filtered, based on
 * the probed capability profile. This includes 32-bit float textures and the
 * filterable 16-bit float fallback used by iOS Safari and vtk.js WebGPU.
 * Historically this was a user-agent iOS check; environments where the probe
 * cannot run (no WebGL context, e.g. unit tests, or WebGL1-only browsers --
 * the texture probes require WebGL2) keep the legacy user-agent behavior so
 * data-preparation code paths stay deterministic there.
 */
function canRenderFloatTextures(): boolean {
  const capabilities = getRenderingCapabilities();

  if (capabilities.webgl2) {
    return getFilterableFloatTexturePrecision(capabilities) !== null;
  }

  return !isIOS();
}

/**
 * Resets the cornerstone-core init state if it has been manually
 * initialized to force use the cpu rendering (e.g., for tests)
 * @category Initialization
 * @deprecated Use `setRenderBackend('auto')` instead.
 */
function resetUseCPURendering(): void {
  const previousEffective = getEffectiveRenderBackend();

  config.rendering.useCPURendering = !getRenderingCapabilities().webgl;
  _updateRenderingPipelinesForAllViewports();

  _notifyEffectiveBackendChange(previousEffective, 'resetUseCPURendering');
}

/**
 * Returns whether or not we are using CPU rendering on legacy viewports.
 * GenericViewport-based viewports resolve through
 * {@link getEffectiveRenderBackend} instead.
 * @returns true if we are using CPU rendering.
 * @category Initialization
 */
function getShouldUseCPURendering(): boolean {
  return config.rendering.useCPURendering;
}

/**
 * Returns whether GenericViewport compatibility adapters are enabled.
 * When true, legacy viewport types are internally routed to GenericViewport-backed
 * implementations while preserving the legacy public API surface for rollout.
 * @returns true if viewport Next remapping is enabled.
 * @category Initialization
 */
function getUseGenericViewport(): boolean {
  return config.rendering.useGenericViewport === true;
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
 * @returns {void}
 * @category Initialization
 */
function _updateRenderingPipelinesForAllViewports(): void {
  getRenderingEngines().forEach((engine) => {
    engine.getViewports().forEach((viewport) => {
      viewport.updateRenderingPipeline?.();
    });
  });
}

/**
 * Emits RENDER_BACKEND_CHANGED when a deprecated CPU-rendering toggle changed
 * the effective backend (the configured value stays whatever it was, so the
 * event carries the effective transition).
 */
function _notifyEffectiveBackendChange(
  previousEffective: EffectiveRenderBackend,
  reason: string
): void {
  const effectiveBackend = getEffectiveRenderBackend();

  if (previousEffective === effectiveBackend) {
    return;
  }

  triggerEvent(eventTarget, Events.RENDER_BACKEND_CHANGED, {
    previous: previousEffective,
    current: effectiveBackend,
    effectiveBackend,
    reason,
  });
}

function getWebWorkerManager() {
  if (!webWorkerManager) {
    webWorkerManager = new CentralizedWebWorkerManager();
  }

  return webWorkerManager;
}

async function peerImport(moduleId: string) {
  return config.peerImport(moduleId);
}

export {
  init,
  getShouldUseCPURendering,
  getUseGenericViewport,
  isCornerstoneInitialized,
  setUseCPURendering,
  setPreferSizeOverAccuracy,
  resetUseCPURendering,
  getRenderBackend,
  setRenderBackend,
  getEffectiveRenderBackend,
  resolveAutoRenderBackend,
  getConfiguration,
  setConfiguration,
  getWebWorkerManager,
  canRenderFloatTextures,
  peerImport,
  resetInitialization,
  getCanUseNorm16Texture,
};
