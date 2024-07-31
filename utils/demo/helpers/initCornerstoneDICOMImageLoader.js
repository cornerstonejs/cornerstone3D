import dicomParser from 'dicom-parser';
import * as cornerstone from '@cornerstonejs/core';
import * as cornerstoneTools from '@cornerstonejs/tools';
import cornerstoneDICOMImageLoader from '@cornerstonejs/dicom-image-loader';

window.cornerstone = cornerstone;
window.cornerstoneTools = cornerstoneTools;
const { preferSizeOverAccuracy, useNorm16Texture } =
  cornerstone.getConfiguration().rendering;

export default function initCornerstoneDICOMImageLoader() {
  let maxWebWorkers = 1;

  if (navigator.hardwareConcurrency) {
    maxWebWorkers = Math.min(navigator.hardwareConcurrency, 7);
  }

  // cornerstone.
  // cornerstoneDICOMImageLoader.

  // cornerstoneDICOMImageLoader.
  cornerstoneDICOMImageLoader.configure({
    cornerstone,
    dicomParser,
    useWebWorkers: true,
    maxWebWorkers: 1,
    decodeConfig: {
      convertFloatPixelDataToInt: false,
      use16BitDataType: preferSizeOverAccuracy || useNorm16Texture,
    },
  });
}
