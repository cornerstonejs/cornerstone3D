import webWorkerManager from '../../src/imageLoader/webWorkerManager.js';
import { expect } from 'chai';

const config = {
  maxWebWorkers: 2,
  startWebWorkersOnDemand: true,
  taskConfiguration: {
    decodeTask: {
      initializeCodecsOnStartup: false,
      usePDFJS: false,
    },
  },
};

describe('config', function() {
  it('should initialize', function() {
    webWorkerManager.initialize(config);
    expect(webWorkerManager.webWorkers.length === 2);
    webWorkerManager.terminate();
  });

  it('should have 0 running workers after .terminate()', function() {
    webWorkerManager.initialize(config);
    webWorkerManager.terminate();
    expect(webWorkerManager.webWorkers.length === 0);
  });
});
