import { getGPUTier } from 'detect-gpu';
import { deepMerge } from './utilities';
import { Cornerstone3DConfig } from './types';

let csRenderInitialized = false;

const defaultConfig: Cornerstone3DConfig = {
  rendering: {
    preferSizeOverAccuracy: true,
    useCPURendering: false,
    hasNorm16TextureSupport: _hasNorm16TextureSupport(),
  },
  // cache
  // ...
};

let config: Cornerstone3DConfig = {
  rendering: {
    preferSizeOverAccuracy: true,
    useCPURendering: false,
    hasNorm16TextureSupport: _hasNorm16TextureSupport(),
  },
  // cache
  // ...
};

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

  // Report the result.
  if (gl && (gl as WebGL2RenderingContext).getExtension) {
    const ext = (gl as WebGL2RenderingContext).getExtension(
      'EXT_texture_norm16'
    );

    if (ext) {
      return true;
    }
  }

  return false;
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

/**
 * Initialize the cornerstone-core. If the browser has a webgl context and
 * the detected gpu (by detect-gpu library) indicates the GPU is not low end we
 * will use webgl GPU rendering. Otherwise we will use cpu rendering.
 *
 * @param configuration - A configuration object
 * @returns A promise that resolves to true cornerstone has been initialized successfully.
 * @category Initialization
 */
async function init(configuration = {}): Promise<boolean> {
  if (csRenderInitialized) {
    return csRenderInitialized;
  }

  // merge configs
  config = deepMerge(defaultConfig, configuration);

  // detectGPU
  const hasWebGLContext = _hasActiveWebGLContext();
  if (!hasWebGLContext) {
    console.log('CornerstoneRender: GPU not detected, using CPU rendering');
    config.rendering.useCPURendering = true;
  } else {
    const gpuTier = await getGPUTier();
    console.log(
      'CornerstoneRender: Using detect-gpu to get the GPU benchmark:',
      gpuTier
    );
    if (gpuTier.tier < 1) {
      console.log(
        'CornerstoneRender: GPU is not powerful enough, using CPU rendering'
      );
      config.rendering.useCPURendering = true;
    } else {
      console.log('CornerstoneRender: using GPU rendering');
    }
  }
  csRenderInitialized = true;
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
}

/**
 * Resets the cornerstone-core init state if it has been manually
 * initialized to force use the cpu rendering (e.g., for tests)
 * @category Initialization
 *
 */
function resetUseCPURendering() {
  config.rendering.useCPURendering = !_hasActiveWebGLContext();
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

/**
 * This function returns a copy of the config object. This is used to prevent the
 * config object from being modified by other parts of the program.
 * @returns A copy of the config object.
 */
function getConfiguration(): Cornerstone3DConfig {
  // return a copy
  return JSON.parse(JSON.stringify(config));
}

/**
 * It takes a new configuration object and merges it with the existing
 * configuration object
 * @param newConfig - The new configuration object.
 */
function setPreferSizeOverAccuracy(status: boolean): void {
  config.rendering.preferSizeOverAccuracy = status;
}

function hasNorm16TextureSupport(): boolean {
  return config.rendering.hasNorm16TextureSupport;
}

export {
  init,
  getShouldUseCPURendering,
  isCornerstoneInitialized,
  setUseCPURendering,
  getConfiguration,
  resetUseCPURendering,
  setPreferSizeOverAccuracy,
  hasNorm16TextureSupport,
};
