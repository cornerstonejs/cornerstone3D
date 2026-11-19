import {
  setUseCPURendering as setCpu,
  setRenderBackend,
  getEffectiveRenderBackend,
} from '@cornerstonejs/core';

setRenderBackend('cpu');
console.log(getEffectiveRenderBackend() === 'cpu');

export const toggles = { setCpu };
