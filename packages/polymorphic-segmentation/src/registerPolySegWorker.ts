import { getWebWorkerManager } from '@cornerstonejs/core';

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
      new URL('./workers/polySegConverters.js', import.meta.url),
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
  };

  workerManager.registerWorker('polySeg', workerFn, options);
}
