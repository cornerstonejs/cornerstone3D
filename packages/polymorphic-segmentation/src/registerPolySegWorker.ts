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
 * Registers the polySeg worker, one instance by default, as in 5.x: each
 * instance loads the wasm of the conversions with its first one and holds
 * about 400 MB more at the peak of a large RTSTRUCT, and a second instance
 * made at once delays the first cut of a cold start. An application opts into
 * more with `polySeg.init({ maxWorkerInstances })`. Measured on the RTSTRUCT
 * of 31 structures of OHIF M79 cut in the two other panes of an MPR (Chrome,
 * Apple silicon): one instance draws the first cut 1.8 s and the last 16 s
 * after the representation is added, two 1.8 to 3 s and 12 to 13 s, four
 * 2 s and 11 to 12 s, as the largest structure alone takes 7 s.
 */
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
