import * as Comlink from 'comlink';
import { RequestPoolManager } from '../requestPool/requestPoolManager';
import { RequestType } from '../enums/';

class CentralizedWorkerManager {
  constructor(maxGlobalWorkers = 5) {
    this.maxGlobalWorkers = maxGlobalWorkers;
    this.workerTypes = {};
    this.currentWorkerIndices = {};
    this.workerQueueManager = new RequestPoolManager('webworker');
  }
  s;

  registerWorker(workerName, workerFn, options = {}) {
    const { maxWebWorkersForThisType = 1, overwrite = false } = options;

    if (this.workerTypes[workerName] && !overwrite) {
      console.warn(`Worker type '${workerName}' is already registered...`);
      return;
    }

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

    const nextWorkerIndex = this.currentWorkerIndices[workerName];
    const nextWorkerAPI =
      this.workerTypes[workerName].instances[nextWorkerIndex];
    this.currentWorkerIndices[workerName] =
      (nextWorkerIndex + 1) % this.workerTypes[workerName].maxWorkers;
    return nextWorkerAPI;
  }

  executeTask(
    workerName,
    methodName,
    successCallback,
    { type = RequestType.Prefetch, priority = 0, args = {}, options = {} }
  ) {
    const requestFn = async () => {
      const api = this.getNextWorkerAPI(workerName);
      if (!api) {
        console.error(`No available worker instance for '${workerName}'`);
        return null;
      }

      try {
        const results = await api[methodName](...args);
        successCallback(results);
      } catch (err) {
        console.error(
          `Error executing method '${methodName}' on worker '${workerName}':`,
          err
        );
        return null;
      }
    };

    this.workerQueueManager.addRequest(requestFn, type, options, priority);
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
