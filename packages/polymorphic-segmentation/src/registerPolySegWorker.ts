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

/**
 * The default number of instances of the polySeg worker: two, and at most one
 * less than the logical processors of the machine, so the main thread keeps
 * one, but at least one. Measured on the RTSTRUCT of 31 structures of OHIF
 * M79 cut in the two other panes of an MPR: two instances draw the last cut
 * 12 s after the representation is added instead of 16 to 17 s with one, and
 * four do no better, as the largest structure alone takes 7 s; each instance
 * holds about 300 MB more at the peak. The first cut comes as soon with one.
 */
function getDefaultWorkerCount(): number {
  const processors = globalThis.navigator?.hardwareConcurrency || 1;

  return Math.max(1, Math.min(2, processors - 1));
}

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
    maxWorkerInstances: getDefaultWorkerCount(),
    autoTerminateOnIdle: {
      enabled: true,
      idleTimeThreshold: 2000,
    },
  };

  const options = utilities.deepMerge(defaultOptions, userOptions);

  workerManager.registerWorker('polySeg', workerFn, options);
}
