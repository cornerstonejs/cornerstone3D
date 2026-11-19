import {
  setUseCPURendering as setCpu,
  getShouldUseCPURendering as cpu,
} from '@cornerstonejs/core';

setCpu(true);
console.log(cpu());

export const toggles = { setCpu };
