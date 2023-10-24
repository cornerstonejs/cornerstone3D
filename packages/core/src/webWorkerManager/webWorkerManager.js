import * as Comlink from 'comlink';
import { RequestType } from '../enums/';
import { RequestPoolManager } from '../requestPool/requestPoolManager';

class CentralizedWorkerManager {
  constructor(maxGlobalWorkers = 5) {
    this.maxGlobalWorkers = maxGlobalWorkers;
    this.workerTypes = {};
    this.currentWorkerIndices = {};
    this.workerPoolManager = new RequestPoolManager('webworker');
    this.workerLoadCounters = {};
  }

  registerWorker(workerName, workerFn, options = {}) {
    const { maxWebWorkersForThisType = 1, overwrite = false } = options;

    if (this.workerTypes[workerName] && !overwrite) {
      console.warn(`Worker type '${workerName}' is already registered...`);
      return;
    }

    this.workerLoadCounters[workerName] = Array(maxWebWorkersForThisType).fill(
      0
    );

    this.workerTypes[workerName] = {
      maxWorkers: maxWebWorkersForThisType,
      instances: [],
    };

    this.currentWorkerIndices[workerName] = 0;

    for (let i = 0; i < maxWebWorkersForThisType; i++) {
      const worker = workerFn();
      const workerWrapper = Comlink.wrap(worker);
      this.workerTypes[workerName].instances.push(workerWrapper);
    }
  }

  getNextWorkerAPI(workerName) {
    if (!this.workerTypes[workerName]) {
      console.error(`Worker type '${workerName}' is not registered.`);
      return null;
    }

    if (!this.workerLoadCounters[workerName]) {
      this.workerLoadCounters[workerName] = [];
    }

    // Find the worker with the minimum load.
    const workerInstances = this.workerTypes[workerName].instances;

    let minLoadIndex = 0;
    let minLoadValue = this.workerLoadCounters[workerName][0] || 0;

    for (let i = 1; i < workerInstances.length; i++) {
      const currentLoadValue = this.workerLoadCounters[workerName][i] || 0;
      if (currentLoadValue < minLoadValue) {
        minLoadIndex = i;
        minLoadValue = currentLoadValue;
      }
    }

    // Update the load counter.
    this.workerLoadCounters[workerName][minLoadIndex]++;

    // return the worker that has the minimum load.
    return { api: workerInstances[minLoadIndex], index: minLoadIndex };
  }

  executeTask(
    workerName,
    methodName,
    { type = RequestType.Prefetch, priority = 0, args = {}, options = {} }
  ) {
    return new Promise((resolve, reject) => {
      const requestFn = async () => {
        const { api, index } = this.getNextWorkerAPI(workerName);
        console.debug('index', index);
        if (!api) {
          const error = new Error(
            `No available worker instance for '${workerName}'`
          );
          console.error(error);
          reject(error);
          return;
        }

        try {
          const results = await api[methodName](...args);
          resolve(results);
        } catch (err) {
          console.error(
            `Error executing method '${methodName}' on worker '${workerName}':`,
            err
          );
          reject(err);
        } finally {
          this.workerLoadCounters[workerName][index]--;
        }
      };

      this.workerPoolManager.addRequest(requestFn, type, options, priority);
    });
  }

  terminate(workerName) {
    if (!this.workerTypes[workerName]) {
      console.error(`Worker type '${workerName}' is not registered.`);
      return;
    }

    this.workerTypes[workerName].instances.forEach((workerInstance) => {
      workerInstance[Comlink.releaseProxy]();
      workerInstance.terminate();
    });

    delete this.workerTypes[workerName];
    delete this.currentWorkerIndices[workerName];
  }
}

export default CentralizedWorkerManager;
