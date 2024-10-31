import { setOptions } from './imageLoader/internal/index';
import type { LoaderOptions } from './types';
import registerLoaders from './imageLoader/registerLoaders';
import { getWebWorkerManager } from '@cornerstonejs/core';

const workerFn = () => {
  const instance = new Worker(
    new URL('../decodeImageFrameWorker.js', import.meta.url),
    { type: 'module' }
  );
  return instance;
};

function init(options: LoaderOptions): void {
  // setting options should happen first, since we use the options in the
  // cornerstone set
  // DO NOT CHANGE THE ORDER OF THESE TWO LINES!
  setOptions(options);
  registerLoaders();

  const workerManager = getWebWorkerManager();
  const maxWorkers = options?.maxWebWorkers || getReasonableWorkerCount();
  workerManager.registerWorker('dicomImageLoader', workerFn, {
    maxWorkerInstances: maxWorkers,
  });
}

function getReasonableWorkerCount(): number {
  if (typeof navigator !== 'undefined' && navigator.hardwareConcurrency) {
    // Use half of the available cores, but at least 1
    return Math.max(1, Math.floor(navigator.hardwareConcurrency / 2));
  }
  // Default to 1 if we can't determine the number of cores
  return 1;
}

export default init;
