import { init } from '@cornerstonejs/core';

const opts = {};

await init(opts);

await init({
  rendering: {
    preferSizeOverAccuracy: true,
  },
});

await init({
  rendering: {
    preferSizeOverAccuracy: true,
  },
});

await init({
  rendering: {
    preferSizeOverAccuracy: true,
    planar: { renderBackend: 'cpu' },
  },
});
