import { computeAndAddSurfaceRepresentation } from './Surface/computeAndAddSurfaceRepresentation';
import { computeAndAddLabelmapRepresentation } from './Labelmap/computeAndAddLabelmapRepresentation';
import { canComputeRequestedRepresentation } from './canComputeRequestedRepresentation';
import { getWebWorkerManager } from '@cornerstonejs/core';

const workerFn = () => {
  return new Worker(new URL('./polySegConverters.js', import.meta.url), {
    name: 'polySeg',
  });
};

const workerManager = getWebWorkerManager();

const options = {
  maxWorkerInstances: 1, // Todo, make this configurable
  autoTerminationOnIdle: 3000,
};

workerManager.registerWorker('polySeg', workerFn, options);

export {
  canComputeRequestedRepresentation,
  // computed representations
  computeAndAddSurfaceRepresentation,
  computeAndAddLabelmapRepresentation,
};
