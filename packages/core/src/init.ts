import { getGPUTier } from 'detect-gpu';
import { SharedArrayBufferModes } from './enums';
import { getRenderingEngines } from './RenderingEngine/getRenderingEngine';
let csRenderInitialized = false;
let useSharedArrayBuffer = true;
let sharedArrayBufferMode = SharedArrayBufferModes.TRUE;
import { deepMerge } from './utilities';
import { Cornerstone3DConfig } from './types';
import CentralizedWebWorkerManager from './webWorkerManager/webWorkerManager';

// TODO: move sharedArrayBuffer into config.
// TODO: change config into a class with methods to better control get/set
const defaultConfig: Cornerstone3DConfig = {
  gpuTier: undefined,
  detectGPUConfig: {},
  isMobile: false, // is mobile device
  rendering: {
    useCPURendering: false,
    // GPU rendering options
    preferSizeOverAccuracy: false,
    useNorm16Texture: false,
    strictZSpacingForVolumeViewport: true,
  },
  // cache
  enableCacheOptimization: true,
};

let config: Cornerstone3DConfig = {
  gpuTier: undefined,
  detectGPUConfig: {},
  isMobile: false, // is mobile device
  rendering: {
    useCPURendering: false,
    // GPU rendering options
    preferSizeOverAccuracy: false,
    useNorm16Texture: false,
    strictZSpacingForVolumeViewport: true,
  },
  // cache
  enableCacheOptimization: true,
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

function hasSharedArrayBuffer() {
  try {
    /*eslint-disable no-constant-condition */
    if (new SharedArrayBuffer(0)) {
      return true;
    } else {
      return false;
    }
  } catch {
    return false;
  }
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
      /MacIntel/.test(navigator.platform)
    );
  }
}

/**
 * Initialize the cornerstone-core. If the browser has a webgl context and
 * the detected gpu (by detect-gpu library) indicates the GPU is not low end we
 * will use webgl GPU rendering. Otherwise we will use cpu rendering.
 *
 * @param configuration - A configuration object
 * @returns A promise that resolves to true cornerstone has been initialized successfully.
 * @category Initialization
 */
async function init(configuration = config): Promise<boolean> {
  if (csRenderInitialized) {
    return csRenderInitialized;
  }

  // merge configs
  config = deepMerge(defaultConfig, configuration);

  if (isIOS()) {
    // iOS devices don't have support for OES_texture_float_linear
    // and thus we should use native data type if we are on iOS
    config.rendering.useNorm16Texture = _hasNorm16TextureSupport();

    if (!config.rendering.useNorm16Texture) {
      if (configuration.rendering?.preferSizeOverAccuracy) {
        config.rendering.preferSizeOverAccuracy = true;
      } else {
        console.log(
          'norm16 texture not supported, you can turn on the preferSizeOverAccuracy flag to use native data type, but be aware of the inaccuracy of the rendering in high bits'
        );
      }
    }
  }

  // gpuTier
  const hasWebGLContext = _hasActiveWebGLContext();
  if (!hasWebGLContext) {
    console.log('CornerstoneRender: GPU not detected, using CPU rendering');
    config.rendering.useCPURendering = true;
  } else {
    config.gpuTier =
      config.gpuTier || (await getGPUTier(config.detectGPUConfig));
    console.log(
      'CornerstoneRender: Using detect-gpu to get the GPU benchmark:',
      config.gpuTier
    );
    if (config.gpuTier?.tier < 1) {
      console.log(
        'CornerstoneRender: GPU is not powerful enough, using CPU rendering'
      );
      config.rendering.useCPURendering = true;
    } else {
      console.log('CornerstoneRender: using GPU rendering');
    }
  }

  setUseSharedArrayBuffer(sharedArrayBufferMode);

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
function setUseCPURendering(status: boolean): void {
  config.rendering.useCPURendering = status;
  csRenderInitialized = true;
  _updateRenderingPipelinesForAllViewports();
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

function setUseSharedArrayBuffer(mode: SharedArrayBufferModes | boolean): void {
  if (mode == SharedArrayBufferModes.AUTO) {
    sharedArrayBufferMode = SharedArrayBufferModes.AUTO;
    const hasSharedBuffer = hasSharedArrayBuffer();
    if (!hasSharedBuffer) {
      useSharedArrayBuffer = false;
      console.warn(
        `CornerstoneRender: SharedArray Buffer not allowed, performance may be slower.
        Try ensuring page is cross-origin isolated to enable SharedArrayBuffer.`
      );
    } else {
      useSharedArrayBuffer = true;
      // eslint-disable-next-line no-console
      console.log('CornerstoneRender: using SharedArrayBuffer');
    }
    return;
  }

  if (mode == SharedArrayBufferModes.TRUE || mode == true) {
    sharedArrayBufferMode = SharedArrayBufferModes.TRUE;
    useSharedArrayBuffer = true;
    return;
  }

  if (mode == SharedArrayBufferModes.FALSE || mode == false) {
    sharedArrayBufferMode = SharedArrayBufferModes.FALSE;
    useSharedArrayBuffer = false;
    return;
  }
}

function resetUseSharedArrayBuffer(): void {
  setUseSharedArrayBuffer(sharedArrayBufferMode);
}

function getShouldUseSharedArrayBuffer(): boolean {
  return useSharedArrayBuffer;
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
  getRenderingEngines().forEach((engine) =>
    engine
      .getViewports()
      .forEach((viewport) => viewport.updateRenderingPipeline?.())
  );
}

function getWebWorkerManager() {
  if (!webWorkerManager) {
    webWorkerManager = new CentralizedWebWorkerManager();
  }

  return webWorkerManager;
}

export {
  init,
  getShouldUseCPURendering,
  getShouldUseSharedArrayBuffer,
  isCornerstoneInitialized,
  setUseCPURendering,
  setUseSharedArrayBuffer,
  setPreferSizeOverAccuracy,
  resetUseCPURendering,
  resetUseSharedArrayBuffer,
  getConfiguration,
  setConfiguration,
  getWebWorkerManager,
  canRenderFloatTextures,
};
