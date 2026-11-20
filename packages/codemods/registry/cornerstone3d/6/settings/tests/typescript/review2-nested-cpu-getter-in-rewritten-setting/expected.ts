import { init, getEffectiveRenderBackend } from '@cornerstonejs/core';

await init({ rendering: { useCPURendering: getEffectiveRenderBackend() === 'cpu' } });
