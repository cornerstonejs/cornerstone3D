import {
  getShouldUseCPURendering,
  getEffectiveRenderBackend,
} from '@cornerstonejs/core';

export function isCPU(getEffectiveRenderBackend: (options: object) => string) {
  getEffectiveRenderBackend({});

  return getShouldUseCPURendering();
}

export const backend = getEffectiveRenderBackend;
