import { getWebWorkerManager, utilities } from '@cornerstonejs/core';

let registered = false;

export type PolySegInitOptions = {
  maxWorkerInstances?: number;
  overwrite?: boolean;
  autoTerminateOnIdle?: {
    enabled?: boolean;
    idleTimeThreshold?: number;
  };
};
export function registerPolySegWorker(userOptions?: PolySegInitOptions) {
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

  const defaultOptions = {
    maxWorkerInstances: 1,
    autoTerminateOnIdle: {
      enabled: true,
      idleTimeThreshold: 2000,
    },
  };

  const options = utilities.deepMerge(defaultOptions, userOptions);

  workerManager.registerWorker('polySeg', workerFn, options);
}
