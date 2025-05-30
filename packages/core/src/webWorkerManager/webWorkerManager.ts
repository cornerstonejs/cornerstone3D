import * as Comlink from 'comlink';
import { RequestType } from '../enums';
import { RequestPoolManager } from '../requestPool/requestPoolManager';

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
   * For instance if you create a worker with maxWorkerInstances = 2, then only 2 instances of this worker will be created
   * and in case there are 10 tasks that need to be executed, each will get assigned 5 tasks.
   * @param {boolean} [options.overwrite=false] - Whether to overwrite the worker if it's already registered.
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
      autoTerminateOnIdle = {
        enabled: false,
        idleTimeThreshold: 3000, // 3 seconds
      },
    } = options;

    if (this.workerRegistry[workerName] && !overwrite) {
      console.warn(`Worker type '${workerName}' is already registered...`);
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

    for (let i = 0; i < maxWorkerInstances; i++) {
      const worker = workerFn();
      workerProperties.instances.push(Comlink.wrap(worker));
      workerProperties.nativeWorkers.push(worker);
      workerProperties.workerFn = workerFn;
    }

    this.workerRegistry[workerName] = workerProperties;
  }

  getNextWorkerAPI(workerName: string) {
    const workerProperties = this.workerRegistry[workerName];

    if (!workerProperties) {
      console.error(`Worker type '${workerName}' is not registered.`);
      return null;
    }

    // Find the worker with the minimum load.
    const workerInstances = workerProperties.instances.filter(
      (instance) => instance !== null
    );

    let minLoadIndex = 0;
    let minLoadValue = workerProperties.loadCounters[0] || 0;
    for (let i = 1; i < workerInstances.length; i++) {
      const currentLoadValue = workerProperties.loadCounters[i] || 0;
      if (currentLoadValue < minLoadValue) {
        minLoadIndex = i;
        minLoadValue = currentLoadValue;
      }
    }

    // Check and recreate the worker if it was terminated.
    if (workerProperties.instances[minLoadIndex] === null) {
      const worker = workerProperties.workerFn();
      workerProperties.instances[minLoadIndex] = Comlink.wrap(worker);
      workerProperties.nativeWorkers[minLoadIndex] = worker;
    }

    // Update the load counter.
    workerProperties.loadCounters[minLoadIndex] += 1;

    // return the worker that has the minimum load.
    return {
      api: workerProperties.instances[minLoadIndex],
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
          console.error(error);
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
          console.error(
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
      const isWorkerActive =
        lastActiveTime !== null && workerProperties.loadCounters[index] > 0;
      const idleTime = now - lastActiveTime;

      if (!isWorkerActive && idleTime > idleTimeThreshold) {
        this.terminateWorkerInstance(workerName, index);
      }
    });
  }

  terminate(workerName: string) {
    const workerProperties = this.workerRegistry[workerName];
    if (!workerProperties) {
      console.error(`Worker type '${workerName}' is not registered.`);
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
