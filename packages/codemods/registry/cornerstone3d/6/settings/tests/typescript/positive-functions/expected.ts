import {
  RenderingEngine,
  setRenderBackend,
  getEffectiveRenderBackend,
} from '@cornerstonejs/core';

let useCPU = false;

function toggle(on: boolean) {
  if (on) {
    setRenderBackend('cpu');
  } else {
    setRenderBackend('auto');
  }
}

function sync() {
  if ((getEffectiveRenderBackend() === 'cpu') !== useCPU) {
    setRenderBackend(useCPU ? 'cpu' : 'auto');
  }

  const label = getEffectiveRenderBackend() === 'cpu' ? 'CPU' : 'GPU';
  const gpu = !(getEffectiveRenderBackend() === 'cpu');

  setRenderBackend('auto');

  return [label, gpu, new RenderingEngine('engine')];
}

setRenderBackend(useCPU || isMobile ? 'cpu' : 'auto');

console.log(toggle, sync);
