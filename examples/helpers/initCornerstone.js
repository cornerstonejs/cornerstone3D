import dicomParser from 'dicom-parser';
import * as cornerstone from '@cornerstone';
import * as csTools3d from '@cornerstone-tools';
import cornerstoneWADOImageLoader from 'cornerstone-wado-image-loader';

import WADORSHeaderProvider from './WADORSHeaderProvider';

// Wire up listeners for renderingEngine's element enabled events
csTools3d.init();

window.cornerstone = cornerstone;
window.cornerstoneWADOImageLoader = cornerstoneWADOImageLoader;

cornerstone.metaData.addProvider(
WADORSHeaderProvider.get.bind(WADORSHeaderProvider),
  9999
);

cornerstoneWADOImageLoader.external.cornerstone = cornerstone;
cornerstoneWADOImageLoader.external.dicomParser = dicomParser;
cornerstoneWADOImageLoader.configure({ useWebWorkers: true });

var config = {
  maxWebWorkers: navigator.hardwareConcurrency || 1,
  startWebWorkersOnDemand: false,
  taskConfiguration: {
    decodeTask: {
      initializeCodecsOnStartup: false,
      usePDFJS: false,
      strict: false,
    },
  },
};

cornerstoneWADOImageLoader.webWorkerManager.initialize(config);
