import { init } from '@cornerstonejs/core';

await init({ rendering: { useGenericViewport: true } });

await init({
  rendering: {
    useGenericViewport: true,
    useCPURendering: true,
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
