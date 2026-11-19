import { setUseCPURendering, resetUseCPURendering } from '@cornerstonejs/core';

const setRenderBackend = (backend: string) => backend;
const coreSetRenderBackend = (backend: string) => backend;

setUseCPURendering(true);
resetUseCPURendering();

export { setRenderBackend, coreSetRenderBackend };
