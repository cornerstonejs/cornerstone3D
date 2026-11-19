import {
  RenderingEngine,
  setUseCPURendering,
  resetUseCPURendering,
  getShouldUseCPURendering,
} from '@cornerstonejs/core';

let useCPU = false;

function toggle(on: boolean) {
  if (on) {
    setUseCPURendering(true);
  } else {
    setUseCPURendering(false);
  }
}

function sync() {
  if (getShouldUseCPURendering() !== useCPU) {
    setUseCPURendering(useCPU);
  }

  const label = getShouldUseCPURendering() ? 'CPU' : 'GPU';
  const gpu = !getShouldUseCPURendering();

  resetUseCPURendering();

  return [label, gpu, new RenderingEngine('engine')];
}

setUseCPURendering(useCPU || isMobile);

console.log(toggle, sync);
