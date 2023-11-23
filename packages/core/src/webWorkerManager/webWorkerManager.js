import * as Comlink from 'comlink';
import { RequestType } from '../enums/';
import { RequestPoolManager } from '../requestPool/requestPoolManager';

class CentralizedWorkerManager {
  constructor() {
    this.workerRegistry = {};
    this.workerPoolManager = new RequestPoolManager('webworker');
    this.checkIntervalForIdleWorkers = 1000;
  }

  setCheckIntervalForIdleWorkers(value) {
    this.checkIntervalForIdleWorkers = value;
  }

  /**
   * Registers a new worker, it doesn't mean that the function will get executed.
   *
   * @param workerName - The name of the worker.
   * @param workerFn - The function that creates a new instance of the worker.
   * @param options - Optional parameters.
   * @param options.maxWorkerInstances - The maximum number of instances of this worker that can be created.
   * For instance if you create a worker with maxWorkerInstances = 2, then only 2 instances of this worker will be created
   * and in case there are 10 tasks that need to be executed, each will get assigned 5 tasks.
   * @param options.overwrite - Whether to overwrite the worker if it's already registered.
   * @param options.autoTerminateOnIdle - Whether to automatically terminate idle workers.
   */
  registerWorker(workerName, workerFn, options = {}) {
    const {
      maxWorkerInstances = 1,
      overwrite = false,
      autoTerminateOnIdle = false,
    } = options;

    if (this.workerRegistry[workerName] && !overwrite) {
      console.warn(`Worker type '${workerName}' is already registered...`);
      return;
    }

    if (overwrite && this.workerRegistry[workerName]?.idleCheckIntervalId) {
      clearInterval(this.workerRegistry[workerName].idleCheckIntervalId);
    }

    const workerProperties = {
      workerFn: null,
      idleCheckIntervalId: null,
      instances: [],
      loadCounters: [],
      lastActiveTime: [],
      // used for termination
      nativeWorkers: [],
    };

    if (
      (autoTerminateOnIdle && !workerProperties.idleCheckIntervalId) ||
      overwrite
    ) {
      const idleCheckIntervalId = setInterval(() => {
        this.terminateIdleWorkers(workerName, autoTerminateOnIdle);
      }, this.checkIntervalForIdleWorkers);

      workerProperties.idleCheckIntervalId = idleCheckIntervalId;
    }

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

  getNextWorkerAPI(workerName) {
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
   * @param workerName - The name of the worker to execute the task on.
   * @param methodName - The name of the method to execute on the worker.
   * @param args - The arguments to pass to the method. Default is an empty object.
   * @param options - An object containing options for the request. Default is an empty object.
   * @param options.requestType - The type of the request. Default is RequestType.Compute.
   * @param options.priority - The priority of the request. Default is 0.
   * @param options.options - Additional options for the request. Default is an empty object.
   *
   * @returns A promise that resolves with the result of the task.
   */
  executeTask(
    workerName,
    methodName,
    args = {},
    { requestType = RequestType.Compute, priority = 0, options = {} } = {}
  ) {
    return new Promise((resolve, reject) => {
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
          const results = await api[methodName](args);

          const workerProperties = this.workerRegistry[workerName];
          workerProperties.lastActiveTime[index] = Date.now();

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

      this.workerPoolManager.addRequest(
        requestFn,
        requestType,
        options,
        priority
      );
    });
  }

  terminateIdleWorkers(workerName, idleTimeThreshold) {
    const workerProperties = this.workerRegistry[workerName];

    const now = Date.now();

    workerProperties.instances.forEach((workerInstance, index) => {
      // If the worker has not yet executed any task, skip this iteration
      if (workerProperties.lastActiveTime[index] == null) {
        return;
      }

      const idleTime = now - workerProperties.lastActiveTime[index];

      // If the worker has been idle for longer than the threshold and it exists
      if (idleTime > idleTimeThreshold && workerInstance !== null) {
        workerInstance[Comlink.releaseProxy]();
        workerProperties.nativeWorkers[index].terminate();

        workerProperties.instances[index] = null;
        workerProperties.lastActiveTime[index] = null;
      }
    });
  }

  terminate(workerName) {
    const workerProperties = this.workerRegistry[workerName];
    if (!workerProperties) {
      console.error(`Worker type '${workerName}' is not registered.`);
      return;
    }

    workerProperties.instances.forEach((workerInstance) => {
      workerInstance[Comlink.releaseProxy]();
    });

    workerProperties.nativeWorkers.forEach((worker) => {
      worker.terminate();
    });
  }
}

export default CentralizedWorkerManager;
