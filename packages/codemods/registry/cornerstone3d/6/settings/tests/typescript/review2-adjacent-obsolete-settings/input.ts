import { init } from '@cornerstonejs/core';

const opts = { rendering: { useGenericViewport: false, useCPURendering: false } };

await init(opts);

await init({
  rendering: {
    useGenericViewport: true,
    useCPURendering: false,
    preferSizeOverAccuracy: true,
  },
});

await init({
  rendering: {
    preferSizeOverAccuracy: true,
    useGenericViewport: true,
    useCPURendering: false,
  },
});

await init({
  rendering: {
    useGenericViewport: false,
    preferSizeOverAccuracy: true,
    useCPURendering: true,
  },
});
