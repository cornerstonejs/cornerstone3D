import { getGPUTier } from 'detect-gpu';
import { SharedArrayBufferModes } from './enums';
let csRenderInitialized = false;
let useSharedArrayBuffer = true;
let sharedArrayBufferMode = SharedArrayBufferModes.TRUE;
import { deepMerge } from './utilities';
import { Cornerstone3DConfig } from './types';
// TODO: move sharedArrayBuffer into config.
// TODO: change config into a class with methods to better control get/set
const defaultConfig = {
  detectGPU: {},
  rendering: {
    preferSizeOverAccuracy: false,
    useCPURendering: false,
    useNorm16Texture: false, // _hasNorm16TextureSupport(),
    strictZSpacingForVolumeViewport: true,
  },
  // cache
  // ...
};

let config = {
  detectGPU: {},
  rendering: {
    preferSizeOverAccuracy: false,
    useCPURendering: false,
    useNorm16Texture: false, // _hasNorm16TextureSupport(),
    strictZSpacingForVolumeViewport: true,
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
    config.detectGPU = gpuTier;
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

  setUseSharedArrayBuffer(sharedArrayBufferMode);

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
function resetUseCPURendering(): void {
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
}

export {
  init,
  getShouldUseCPURendering,
  getShouldUseSharedArrayBuffer,
  isCornerstoneInitialized,
  setUseCPURendering,
  setUseSharedArrayBuffer,
  resetUseCPURendering,
  resetUseSharedArrayBuffer,
  getConfiguration,
  setConfiguration,
};
