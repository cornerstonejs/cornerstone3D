import {
  getEffectiveRenderBackend,
  init,
  setRenderBackend,
} from '@cornerstonejs/core';

function setUseCPURendering(value: boolean) {
  return value;
}

await init({ rendering: { planar: { renderBackend: 'cpu' } } });
setRenderBackend('auto');
setUseCPURendering(true);
viewport.setUseCPURendering(true);

const settings = { useGenericViewport: true, useCPURendering: true };

console.log(getEffectiveRenderBackend() === 'cpu', settings);
