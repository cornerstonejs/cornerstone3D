import dicomParser from 'dicom-parser';
import * as cornerstone from '@cornerstonejs/core';
import * as cornerstoneTools from '@cornerstonejs/tools';

import cornerstoneWADOImageLoader from 'cornerstone-wado-image-loader';

window.cornerstone = cornerstone;
window.cornerstoneTools = cornerstoneTools;

export default function initCornerstoneWADOImageLoader() {
  cornerstoneWADOImageLoader.external.cornerstone = cornerstone;
  cornerstoneWADOImageLoader.external.dicomParser = dicomParser;
  cornerstoneWADOImageLoader.configure({
    useWebWorkers: true,
    decodeConfig: {
      convertFloatPixelDataToInt: false,
    },
  });

  let maxWebWorkers = 1;

  if (navigator.hardwareConcurrency) {
    maxWebWorkers = Math.min(navigator.hardwareConcurrency, 7);
  }

  var config = {
    maxWebWorkers,
    startWebWorkersOnDemand: false,
    taskConfiguration: {
      decodeTask: {
        initializeCodecsOnStartup: false,
        strict: false,
      },
    },
  };

  cornerstoneWADOImageLoader.webWorkerManager.initialize(config);
}
