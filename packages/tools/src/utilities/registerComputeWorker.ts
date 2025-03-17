import { getWebWorkerManager } from '@cornerstonejs/core';
import { getConfig } from '../config';

let registered = false;

export function registerComputeWorker() {
  if (registered) {
    return;
  }

  registered = true;

  const workerFn = () => {
    // @ts-ignore
    return new Worker(
      // @ts-ignore
      new URL('../workers/computeWorker.js', import.meta.url),
      {
        name: 'compute',
        type: 'module',
      }
    );
  };

  const workerManager = getWebWorkerManager();
  const config = getConfig();
  const computeWorkerConfig = config.computeWorker;

  const options = {
    maxWorkerInstances: 1,
    autoTerminateOnIdle: computeWorkerConfig?.autoTerminateOnIdle ?? {
      enabled: true,
      idleTimeThreshold: 2000,
    },
  };

  workerManager.registerWorker('compute', workerFn, options);
}
