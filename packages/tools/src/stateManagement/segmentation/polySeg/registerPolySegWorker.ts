import { getWebWorkerManager } from '@cornerstonejs/core';
import { getConfig } from '../../../config';

let registered = false;

export function registerPolySegWorker() {
  if (registered) {
    return;
  }

  registered = true;

  const workerFn = () => {
    // @ts-ignore
    return new Worker(
      // @ts-ignore
      new URL('../../../workers/polySegConverters', import.meta.url),
      {
        name: 'polySeg',
        type: 'module',
      }
    );
  };

  const workerManager = getWebWorkerManager();

  const options = {
    maxWorkerInstances: 1,
    autoTerminateOnIdle: {
      enabled: true,
      idleTimeThreshold: 2000,
    },
    enablePolySeg: getConfig().enablePolySeg,
  };

  workerManager.registerWorker('polySeg', workerFn, options);
}
