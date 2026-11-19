import { init } from '@cornerstonejs/core';

await init();

await init({
  rendering: {
    planar: { renderBackend: 'cpu' },
  },
});

await initDemo({
  core: {
    rendering: {
      preferSizeOverAccuracy: true,
      useGenericViewport: true,
      useCPURendering: false,
      planarSettings: {},
    },
  },
});

export const configuration = {
  rendering: {
    useCPURendering: isMobile,
    planarSettings: { cpuVolume: { useViewportSamplingForLinear: true } },
  },
};
