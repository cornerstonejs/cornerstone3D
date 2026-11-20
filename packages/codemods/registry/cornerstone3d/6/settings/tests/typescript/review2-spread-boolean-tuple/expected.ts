import { setUseCPURendering, setRenderBackend } from '@cornerstonejs/core';

const tuple: [boolean] = [false];

setUseCPURendering(...tuple);
setRenderBackend('cpu');
