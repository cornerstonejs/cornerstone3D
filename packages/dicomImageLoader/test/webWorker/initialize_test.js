import webWorkerManager from '../../src/imageLoader/webWorkerManager.js';
import { expect } from 'chai';

const config = {
  maxWebWorkers: 2,
  startWebWorkersOnDemand: true,
  webWorkerPath: '/base/dist/cornerstoneWADOImageLoaderWebWorker.js',
  taskConfiguration: {
    decodeTask: {
      loadCodecsOnStartup: true,
      initializeCodecsOnStartup: false,
      codecsPath: '/base/dist/cornerstoneWADOImageLoaderCodecs.js',
      usePDFJS: false
    }
  }
};

describe('config', function () {
  it('should initialize', function () {
    webWorkerManager.initialize(config);
    expect(webWorkerManager.webWorkers.length === 2);
    webWorkerManager.terminate();
  });

  it('should have 0 running workers after .terminate()', function () {
    webWorkerManager.initialize(config);
    webWorkerManager.terminate();
    expect(webWorkerManager.webWorkers.length === 0);
  });
});
