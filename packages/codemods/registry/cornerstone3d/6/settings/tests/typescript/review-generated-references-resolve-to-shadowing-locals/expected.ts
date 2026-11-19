import {
  getEffectiveRenderBackend,
  getEffectiveRenderBackend as coreGetEffectiveRenderBackend,
} from '@cornerstonejs/core';

export function isCPU(getEffectiveRenderBackend: (options: object) => string) {
  getEffectiveRenderBackend({});

  return coreGetEffectiveRenderBackend() === 'cpu';
}

export const backend = getEffectiveRenderBackend;
