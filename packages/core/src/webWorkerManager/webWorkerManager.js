import * as Comlink from 'comlink';

class CentralizedWorkerManager {
  constructor(maxGlobalWorkers = 5) {
    this.maxGlobalWorkers = maxGlobalWorkers;
    this.workerTypes = {};
    this.currentWorkerIndices = {};
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

  async executeTask(workerName, methodName, ...args) {
    const api = this.getNextWorkerAPI(workerName);
    if (!api) {
      console.error(`No available worker instance for '${workerName}'`);
      return null;
    }

    try {
      return await api[methodName](...args);
    } catch (err) {
      console.error(
        `Error executing method '${methodName}' on worker '${workerName}':`,
        err
      );
      return null;
    }
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
