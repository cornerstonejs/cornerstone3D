import * as Comlink from 'comlink';
import { RequestType } from '../enums';
import { RequestPoolManager } from '../requestPool/requestPoolManager';
import { coreLog } from '../utilities/logger';

const registrationLog = coreLog.getLogger(
  'webWorkerManager',
  'webWorkerManager'
);

export type WebWorkerManagerOptions = {
  /**
   * The maximum number of worker instances that can be created for a specific worker type.
   * @default 1
   */
  maxWorkerInstances?: number;

  /**
   * Whether to overwrite the worker if it's already registered.
   * @default false
   */
  overwrite?: boolean;

  /**
   * When the instances are made:
   * - `'onFirstTask'`: an instance is made when a task needs it (no instance
   *   is idle), so a worker that is registered and never used costs nothing;
   * - `'atRegistration'`: every instance is made at registration;
   * - `'whenIdle'`: every instance is made at the first idle period of the
   *   main thread after registration (`requestIdleCallback`), so each loads
   *   its script before the first task without adding to the start-up work;
   *   a task that comes first makes the instance it needs at once, as with
   *   `'onFirstTask'`.
   * The decode workers of the DICOM image loader are made when idle: their
   * first task is the first image of a load, which would otherwise wait for
   * a worker to start.
   * @default 'onFirstTask'
   */
  createInstances?: 'onFirstTask' | 'atRegistration' | 'whenIdle';

  /**
   * Configuration for automatically terminating idle workers.
   */
  autoTerminateOnIdle?: {
    enabled?: boolean;
    idleTimeThreshold?: number; // in milliseconds
  };
};

type WebWorkerProperties = {
  workerFn: () => Worker;
  instances: Comlink.Remote<unknown>[];
  loadCounters: number[];
  lastActiveTime: (number | null)[];
  nativeWorkers: Worker[];
  autoTerminateOnIdle: boolean;
  idleCheckIntervalId: NodeJS.Timeout | null;
  idleTimeThreshold: number;
  processing?: boolean; // Indicates if the worker is currently processing a task
};

/**
 * Calls back at the next idle period of the main thread, or after the
 * current task where the browser has no `requestIdleCallback`.
 */
function whenIdle(callback: () => void): void {
  if (typeof globalThis.requestIdleCallback === 'function') {
    globalThis.requestIdleCallback(callback);
  } else {
    setTimeout(callback, 0);
  }
}

class CentralizedWorkerManager {
  workerRegistry: Record<string, WebWorkerProperties> = {};
  workerPoolManager = new RequestPoolManager('webworker');

  /**
   * Registers a new worker, it doesn't mean that the function will get executed.
   *
   * @param workerName - The name of the worker.
   * @param workerFn - The function that creates a new instance of the worker.
   * @param {object} options - Optional parameters.
   * @param {number} [options.maxWorkerInstances=1] - The maximum number of instances of this worker that can be created.
   * For instance if you create a worker with maxWorkerInstances = 2, then at most 2 instances of this worker will be created
   * and in case there are 10 tasks that need to be executed, each will get assigned 5 tasks. An instance is created when
   * a task needs it (no instance is idle), not at registration, and again after it was terminated.
   * @param {boolean} [options.overwrite=false] - Whether to overwrite the worker if it's already registered.
   * @param {string} [options.createInstances='onFirstTask'] - When the instances are made: 'onFirstTask', 'atRegistration' or 'whenIdle'.
   * @param {object} [options.autoTerminateOnIdle] - Configuration for automatically terminating idle workers.
   * @param {boolean} [options.autoTerminateOnIdle.enabled=false] - Whether to enable auto-termination.
   * @param {number} [options.autoTerminateOnIdle.idleTimeThreshold=3000] - Idle time threshold in milliseconds.
   */
  registerWorker(
    workerName: string,
    workerFn: () => Worker,
    options: WebWorkerManagerOptions = {}
  ) {
    const {
      maxWorkerInstances = 1,
      overwrite = false,
      createInstances = 'onFirstTask',
      autoTerminateOnIdle = {
        enabled: false,
        idleTimeThreshold: 3000, // 3 seconds
      },
    } = options;

    if (this.workerRegistry[workerName] && !overwrite) {
      registrationLog.warn(
        `Worker type '${workerName}' is already registered...`
      );
      return;
    }

    if (overwrite && this.workerRegistry[workerName]?.idleCheckIntervalId) {
      clearInterval(this.workerRegistry[workerName].idleCheckIntervalId);
    }

    const workerProperties: WebWorkerProperties = {
      workerFn: null,
      instances: [],
      loadCounters: [],
      lastActiveTime: [],
      // used for termination
      nativeWorkers: [],
      // auto termination
      autoTerminateOnIdle: autoTerminateOnIdle.enabled,
      idleCheckIntervalId: null,
      idleTimeThreshold: autoTerminateOnIdle.idleTimeThreshold,
    };

    workerProperties.loadCounters = Array(maxWorkerInstances).fill(0);
    workerProperties.lastActiveTime = Array(maxWorkerInstances).fill(null);
    workerProperties.instances = Array(maxWorkerInstances).fill(null);
    workerProperties.nativeWorkers = Array(maxWorkerInstances).fill(null);
    workerProperties.workerFn = workerFn;

    this.workerRegistry[workerName] = workerProperties;

    if (createInstances === 'atRegistration') {
      this.createMissingInstances(workerProperties);
    } else if (createInstances === 'whenIdle') {
      whenIdle(() => {
        if (this.workerRegistry[workerName] === workerProperties) {
          this.createMissingInstances(workerProperties);
        }
      });
    }
  }

  /** Makes every instance of a worker that does not exist. */
  private createMissingInstances(workerProperties: WebWorkerProperties) {
    workerProperties.instances.forEach((instance, index) => {
      if (instance === null) {
        this.createInstance(workerProperties, index);
      }
    });
  }

  /** Makes the instance of a worker at an index. */
  private createInstance(workerProperties: WebWorkerProperties, index: number) {
    const worker = workerProperties.workerFn();

    workerProperties.instances[index] = Comlink.wrap(worker);
    workerProperties.nativeWorkers[index] = worker;
  }

  /**
   * Gives the instance of a worker that takes the next task, and makes it
   * when it does not exist yet or was terminated. Every instance is weighed by
   * its own index, whatever instances before it were terminated: the one with
   * the fewest tasks in flight wins, so an idle instance goes before one that
   * runs a task, and among instances with no task one that exists goes before
   * one that must be made. An instance is made when a task needs it, so
   * registering several instances costs nothing until as many tasks run at
   * once.
   */
  getNextWorkerAPI(workerName: string) {
    const workerProperties = this.workerRegistry[workerName];

    if (!workerProperties) {
      registrationLog.error(`Worker type '${workerName}' is not registered.`);
      return null;
    }

    const { instances, loadCounters } = workerProperties;
    let minLoadIndex = 0;

    for (let index = 1; index < instances.length; index++) {
      const load = loadCounters[index] || 0;
      const minLoad = loadCounters[minLoadIndex] || 0;

      if (
        load < minLoad ||
        (load === minLoad &&
          instances[minLoadIndex] === null &&
          instances[index] !== null)
      ) {
        minLoadIndex = index;
      }
    }

    if (instances[minLoadIndex] === null) {
      this.createInstance(workerProperties, minLoadIndex);
    }

    loadCounters[minLoadIndex] += 1;

    return {
      api: instances[minLoadIndex],
      index: minLoadIndex,
    };
  }

  /**
   * Executes a task on a worker.
   *
   * @param {string} workerName - The name of the worker to execute the task on.
   * @param {string} methodName - The name of the method to execute on the worker.
   * @param {object} [args={}] - The arguments to pass to the method.
   * @param {object} [options] - An object containing options for the request.
   * @param {RequestType} [options.requestType=RequestType.Compute] - The type of the request.
   * @param {number} [options.priority=0] - The priority of the request.
   * @param {object} [options.options] - Additional options for the request.
   * @param {Function[]} [options.callbacks=[]] - Callback functions.
   * @returns {Promise} A promise that resolves with the result of the task.
   */

  // Defaults to returning any
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  executeTask<WorkerFnReturnType = any>(
    workerName: string,
    methodName: string,
    args = {},
    {
      requestType = RequestType.Compute,
      priority = 0,
      options = {},
      callbacks = [],
    } = {}
  ) {
    return new Promise<WorkerFnReturnType>((resolve, reject) => {
      const requestFn = async () => {
        const { api, index } = this.getNextWorkerAPI(workerName);
        if (!api) {
          const error = new Error(
            `No available worker instance for '${workerName}'`
          );
          registrationLog.error(error);
          reject(error);
          return;
        }

        try {
          // fix if any of the args keys are a function then we need to proxy it
          // for the worker to be able to call it
          let finalCallbacks = [];
          if (callbacks.length) {
            finalCallbacks = callbacks.map((cb) => {
              return Comlink.proxy(cb);
            });
          }
          const workerProperties = this.workerRegistry[workerName];

          workerProperties.processing = true;

          const results = await api[methodName](args, ...finalCallbacks);

          workerProperties.processing = false;
          workerProperties.lastActiveTime[index] = Date.now();

          // If auto termination is enabled and the interval is not set, set it.
          if (
            workerProperties.autoTerminateOnIdle &&
            !workerProperties.idleCheckIntervalId &&
            workerProperties.idleTimeThreshold
          ) {
            workerProperties.idleCheckIntervalId = setInterval(() => {
              this.terminateIdleWorkers(
                workerName,
                workerProperties.idleTimeThreshold
              );
            }, workerProperties.idleTimeThreshold);
          }

          resolve(results);
        } catch (err) {
          registrationLog.error(
            `Error executing method '${methodName}' on worker '${workerName}':`,
            err
          );
          reject(err);
        } finally {
          this.workerRegistry[workerName].loadCounters[index]--;
        }
      };

      // I believe there is a bug right now, where if there are two workers
      // and one wants to run a compute job 6 times and the limit is just 5, then
      // the other worker will never get a chance to run its compute job.
      // we should probably have a separate limit for compute jobs per worker
      // context as there is another layer of parallelism there.
      this.workerPoolManager.addRequest(
        requestFn,
        requestType,
        options,
        priority
      );
    });
  }

  terminateIdleWorkers(workerName: string, idleTimeThreshold: number) {
    const workerProperties = this.workerRegistry[workerName];

    if (workerProperties.processing) {
      return;
    }

    const now = Date.now();

    workerProperties.instances.forEach((_, index) => {
      const lastActiveTime = workerProperties.lastActiveTime[index];
      const isWorkerActive = workerProperties.loadCounters[index] > 0;
      const idleTime = now - lastActiveTime;

      if (!isWorkerActive && idleTime > idleTimeThreshold) {
        this.terminateWorkerInstance(workerName, index);
      }
    });
  }

  terminate(workerName: string) {
    const workerProperties = this.workerRegistry[workerName];
    if (!workerProperties) {
      registrationLog.error(`Worker type '${workerName}' is not registered.`);
      return;
    }

    workerProperties.instances.forEach((_, index) => {
      this.terminateWorkerInstance(workerName, index);
    });
  }

  // New method to handle individual worker termination
  terminateWorkerInstance(workerName, index) {
    const workerProperties = this.workerRegistry[workerName];
    const workerInstance = workerProperties.instances[index];

    if (workerInstance !== null) {
      workerInstance[Comlink.releaseProxy]();
      workerProperties.nativeWorkers[index].terminate();

      // Set the worker instance to null after termination
      workerProperties.instances[index] = null;
      workerProperties.lastActiveTime[index] = null;
    }
  }
}

export default CentralizedWorkerManager;
