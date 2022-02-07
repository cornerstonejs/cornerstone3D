import { getGPUTier } from 'detect-gpu';

let csRenderInitialized = false;
let useCPURendering = false;

// https://developer.mozilla.org/en-US/docs/Web/API/WebGL_API/By_example/Detect_WebGL
function hasActiveWebGLContext() {
  // Create canvas element. The canvas is not added to the
  // document itself, so it is never displayed in the
  // browser window.
  const canvas = document.createElement('canvas');
  // Get WebGLRenderingContext from canvas element.
  const gl =
    canvas.getContext('webgl') || canvas.getContext('experimental-webgl');

  // Report the result.
  if (gl && gl instanceof WebGLRenderingContext) {
    return true;
  }

  return false;
}

async function init(defaultConfiguration = {}): Promise<boolean> {
  if (csRenderInitialized) {
    return csRenderInitialized;
  }

  // detectGPU
  const hasWebGLGontext = hasActiveWebGLContext();
  if (!hasWebGLGontext) {
    useCPURendering = true;
    console.log('CornerstoneRender: GPU not detected, using CPU rendering');
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
      useCPURendering = true;
    } else {
      console.log('CornerstoneRender: using GPU rendering');
    }
  }
  csRenderInitialized = true;
  return csRenderInitialized;
}

function setUseCPURenderingOnlyForDebugOrTests(status: boolean): void {
  useCPURendering = status;
  csRenderInitialized = true;
}

function resetCPURenderingOnlyForDebugOrTests() {
  useCPURendering = !hasActiveWebGLContext();
}

function getShouldUseCPURendering(): boolean {
  return useCPURendering;
}

function isCornerstoneInitialized(): boolean {
  return csRenderInitialized;
}

export {
  init,
  getShouldUseCPURendering,
  isCornerstoneInitialized,
  setUseCPURenderingOnlyForDebugOrTests,
  resetCPURenderingOnlyForDebugOrTests,
};
