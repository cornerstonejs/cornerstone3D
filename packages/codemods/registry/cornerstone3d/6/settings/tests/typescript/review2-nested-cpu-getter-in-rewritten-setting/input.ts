import { getShouldUseCPURendering, init } from '@cornerstonejs/core';

await init({ rendering: { useCPURendering: getShouldUseCPURendering() } });
