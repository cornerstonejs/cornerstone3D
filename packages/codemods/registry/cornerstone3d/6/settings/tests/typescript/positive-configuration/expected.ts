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
      planarSettings: {},
    },
  },
});

export const configuration = {
  rendering: {
    planar: { renderBackend: isMobile ? 'cpu' : 'auto' },
    planarSettings: {},
  },
};
