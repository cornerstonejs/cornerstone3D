import dicomParser from 'dicom-parser';
import * as cornerstone from '@cornerstonejs/core';
import * as cornerstoneTools from '@cornerstonejs/tools';
import cornerstoneDICOMImageLoader from '@cornerstonejs/dicom-image-loader';

window.cornerstone = cornerstone;
window.cornerstoneTools = cornerstoneTools;

export default function initCornerstoneDICOMImageLoader() {
  const { preferSizeOverAccuracy, useNorm16Texture } =
    cornerstone.getConfiguration().rendering;
  let maxWebWorkers = 1;

  if (navigator.hardwareConcurrency) {
    maxWebWorkers = Math.min(navigator.hardwareConcurrency, 7);
  }

  cornerstoneDICOMImageLoader.init({
    cornerstone,
    dicomParser,
    configuration: {
      useWebWorkers: true,
      decodeConfig: {
        convertFloatPixelDataToInt: false,
        use16BitDataType: preferSizeOverAccuracy || useNorm16Texture,
      },
      webWorkers: {
        maxWebWorkers,
        startWebWorkersOnDemand: false,
        taskConfiguration: {
          decodeTask: {
            initializeCodecsOnStartup: false,
            strict: false,
          },
        },
      },
    },
  });
}
