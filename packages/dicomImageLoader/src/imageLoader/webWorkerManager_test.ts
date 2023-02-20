import { expect } from 'chai';
import webWorkerManager from './webWorkerManager.js';

const config = {
  maxWebWorkers: 2,
  startWebWorkersOnDemand: true,
  taskConfiguration: {
    decodeTask: {
      initializeCodecsOnStartup: false,
    },
  },
};

describe('config', function () {
  it('should initialize', () => {
    webWorkerManager.initialize(config);
    expect(webWorkerManager.webWorkers.length === 2);
    webWorkerManager.terminate();
  });

  it('should have 0 running workers after .terminate()', () => {
    webWorkerManager.initialize(config);
    webWorkerManager.terminate();
    expect(webWorkerManager.webWorkers.length === 0);
  });
});
