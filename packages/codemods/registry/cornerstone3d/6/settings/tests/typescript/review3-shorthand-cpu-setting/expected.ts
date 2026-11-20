import { init } from '@cornerstonejs/core';

export async function boot(useCPURendering: boolean) {
  await init({ rendering: { planar: { renderBackend: useCPURendering ? 'cpu' : 'auto' } } });
}

export async function bootGeneric(useGenericViewport: boolean) {
  await init({
    rendering: { strictZSpacingForVolumeViewport: true },
  });

  return useGenericViewport;
}
