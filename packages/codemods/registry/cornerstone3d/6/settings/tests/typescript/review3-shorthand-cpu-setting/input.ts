import { init } from '@cornerstonejs/core';

export async function boot(useCPURendering: boolean) {
  await init({ rendering: { useCPURendering } });
}

export async function bootGeneric(useGenericViewport: boolean) {
  await init({
    rendering: { useGenericViewport, strictZSpacingForVolumeViewport: true },
  });

  return useGenericViewport;
}
