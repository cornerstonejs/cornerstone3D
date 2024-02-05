import { getWebWorkerManager } from '@cornerstonejs/core';

let registered = false;

export function registerDisplayToolsWorker() {
  if (registered) {
    return;
  }

  registered = true;

  const workerFn = () => {
    // @ts-ignore
    return new Worker(
      // @ts-ignore
      new URL('../../workers/clippingPlaneWorker', import.meta.url),
      {
        name: 'displayTools',
      }
    );
  };

  const workerManager = getWebWorkerManager();

  const options = {
    maxWorkerInstances: 1, // Todo, make this configurable
    autoTerminateOnIdle: {
      enabled: true,
      idleTimeThreshold: 2000,
    },
  };

  workerManager.registerWorker('displayTools', workerFn, options);
}
