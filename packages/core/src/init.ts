import { getRenderingEngines } from './RenderingEngine/getRenderingEngine';
let csRenderInitialized = false;
import deepMerge from './utilities/deepMerge';
import type { Cornerstone3DConfig } from './types';
import CentralizedWebWorkerManager from './webWorkerManager/webWorkerManager';

// TODO: change config into a class with methods to better control get/set
const defaultConfig: Cornerstone3DConfig = {
  gpuTier: { tier: 2 }, // Assume medium tier by default
  isMobile: false, // is mobile device
  rendering: {
    useCPURendering: false,
    // GPU rendering options
    preferSizeOverAccuracy: false,
    strictZSpacingForVolumeViewport: true,
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

let webWorkerManager = null;

function _getGLContext(): RenderingContext {
  // Create canvas element. The canvas is not added to the
  // document itself, so it is never displayed in the
  // browser window.
  const canvas = document.createElement('canvas');
  // Get WebGLRenderingContext from canvas element.
  const gl =
    canvas.getContext('webgl2') ||
    canvas.getContext('webgl') ||
    canvas.getContext('experimental-webgl');

  return gl;
}

// https://developer.mozilla.org/en-US/docs/Web/API/WebGL_API/By_example/Detect_WebGL
function _hasActiveWebGLContext() {
  const gl = _getGLContext();

  // Check if the context is either WebGLRenderingContext or WebGL2RenderingContext
  return (
    gl instanceof WebGLRenderingContext || gl instanceof WebGL2RenderingContext
  );
}

function _hasNorm16TextureSupport() {
  const gl = _getGLContext();

  if (gl) {
    const ext = (gl as WebGL2RenderingContext).getExtension(
      'EXT_texture_norm16'
    );

    if (ext) {
      return true;
    }
  }

  return false;
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
 * Initialize the cornerstone-core. This function checks for WebGL context availability
 * to determine if GPU rendering is possible. By default, it assumes a medium GPU tier.
 *
 * It's the responsibility of the consumer application to provide accurate GPU tier information
 * if needed. Libraries like 'detect-gpu' can be used for this purpose, and the result can be
 * passed in the configuration object.
 *
 * If a WebGL context is available, GPU rendering will be used. Otherwise, it will fall back
 * to CPU rendering for supported operations.
 *
 * @param configuration - A configuration object, which can include GPU tier information
 * @returns A promise that resolves to true if cornerstone has been initialized successfully.
 * @category Initialization
 */
function init(configuration = config): boolean {
  if (csRenderInitialized) {
    return csRenderInitialized;
  }

  // merge configs
  config = deepMerge(defaultConfig, configuration);

  if (isIOS()) {
    if (configuration.rendering?.preferSizeOverAccuracy) {
      config.rendering.preferSizeOverAccuracy = true;
    } else {
      console.log(
        'norm16 texture not supported, you can turn on the preferSizeOverAccuracy flag to use native data type, but be aware of the inaccuracy of the rendering in high bits'
      );
    }
  }

  const hasWebGLContext = _hasActiveWebGLContext();
  if (!hasWebGLContext) {
    console.log('CornerstoneRender: GPU not detected, using CPU rendering');
    config.rendering.useCPURendering = true;
  } else {
    console.log('CornerstoneRender: using GPU rendering');
  }

  csRenderInitialized = true;

  if (!webWorkerManager) {
    webWorkerManager = new CentralizedWebWorkerManager();
  }

  return csRenderInitialized;
}

/**
 * It sets the useCPURenderingOnlyForDebugOrTests variable to the status value.
 * This only should be used for debugging or tests. DO NOT USE IT IF YOU ARE NOT
 * SURE WHAT YOU ARE DOING.
 * @param status - boolean
 * @category Initialization
 *
 */
function setUseCPURendering(status: boolean, updateViewports = true): void {
  config.rendering.useCPURendering = status;
  csRenderInitialized = true;
  if (updateViewports) {
    _updateRenderingPipelinesForAllViewports();
  }
}

function setPreferSizeOverAccuracy(status: boolean): void {
  config.rendering.preferSizeOverAccuracy = status;
  csRenderInitialized = true;
  _updateRenderingPipelinesForAllViewports();
}

/**
 * Only IPhone IOS cannot render float textures right now due to the lack of support for OES_texture_float_linear.
 * So we should not use float textures on IOS devices.
 */
function canRenderFloatTextures(): boolean {
  if (!isIOS()) {
    return true;
  }

  return false;
}

/**
 * Resets the cornerstone-core init state if it has been manually
 * initialized to force use the cpu rendering (e.g., for tests)
 * @category Initialization
 *
 */
function resetUseCPURendering(): void {
  config.rendering.useCPURendering = !_hasActiveWebGLContext();
  _updateRenderingPipelinesForAllViewports();
}

/**
 * Returns whether or not we are using CPU rendering.
 * @returns true if we are using CPU rendering.
 * @category Initialization
 *
 */
function getShouldUseCPURendering(): boolean {
  return config.rendering.useCPURendering;
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
 * @returns {void}
 * @category Initialization
 */
function _updateRenderingPipelinesForAllViewports(): void {
  getRenderingEngines().forEach((engine) => {
    engine.getViewports().forEach((viewport) => {
      viewport.updateRenderingPipeline();
    });
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
  isCornerstoneInitialized,
  setUseCPURendering,
  setPreferSizeOverAccuracy,
  resetUseCPURendering,
  getConfiguration,
  setConfiguration,
  getWebWorkerManager,
  canRenderFloatTextures,
  peerImport,
  resetInitialization,
};
