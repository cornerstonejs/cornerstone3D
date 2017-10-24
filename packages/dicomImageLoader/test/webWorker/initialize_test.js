import { external } from '../../src/externalModules.js';
import webWorkerManager from '../../src/imageLoader/webWorkerManager.js';

external.cornerstone = window.cornerstone;

describe('config', function () {
  it('should initialize', function () {
    // Initialize the web worker manager
    const config = {
      maxWebWorkers: 1,
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

    webWorkerManager.initialize(config);
  });
});
