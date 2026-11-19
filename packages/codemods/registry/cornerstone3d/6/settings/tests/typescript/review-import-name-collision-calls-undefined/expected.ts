import { setRenderBackend as coreSetRenderBackend2 } from '@cornerstonejs/core';

const setRenderBackend = (backend: string) => backend;
const coreSetRenderBackend = (backend: string) => backend;

coreSetRenderBackend2('cpu');
coreSetRenderBackend2('auto');

export { setRenderBackend, coreSetRenderBackend };
