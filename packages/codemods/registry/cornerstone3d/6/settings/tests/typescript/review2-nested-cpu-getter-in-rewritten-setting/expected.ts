import { init, getEffectiveRenderBackend } from '@cornerstonejs/core';

await init({ rendering: { planar: { renderBackend: getEffectiveRenderBackend() === 'cpu' ? 'cpu' : 'auto' } } });
