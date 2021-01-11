// @TODO: Only using `cornerstone-tools` for `requestPoolManager` in `prefetchImageIds`
// This can be replaced w/ an implementation in render library

import dicomParser from 'dicom-parser';
import cornerstone from 'cornerstone-core';
import cornerstoneWADOImageLoader from 'cornerstone-wado-image-loader';
import WADORSHeaderProvider from './WADORSHeaderProvider';
// ~~
import { register as registerVTKViewportLoaders } from './../../src/index';
import csTools3d from './../../src/cornerstone-tools-3d/index';

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
registerVTKViewportLoaders(cornerstone);
