import initProviders from './initProviders';
import initVolumeLoader from './initVolumeLoader';
import {
  init as csRenderInit,
  imageLoader,
  volumeLoader,
  metaData,
} from '@cornerstonejs/core';
import * as cornerstoneTools from '@cornerstonejs/tools';
import * as cornerstone from '@cornerstonejs/core';
import { init as csToolsInit } from '@cornerstonejs/tools';
import { fakeVolumeLoader } from '../../test/testUtilsVolumeLoader';
import {
  fakeImageLoader,
  fakeMetaDataProvider,
} from '../../test/testUtilsImageLoader';
import cornerstoneDICOMImageLoader from '@cornerstonejs/dicom-image-loader';

window.cornerstone = cornerstone;
window.cornerstoneTools = cornerstoneTools;

export default async function initDemo(config) {
  initProviders();
  cornerstoneDICOMImageLoader.init();
  initVolumeLoader();
  await csRenderInit({
    peerImport,
    ...(config?.core ? config.core : {}),
  });
  await csToolsInit();

  // for testings, you don't need any of these
  volumeLoader.registerVolumeLoader('fakeVolumeLoader', fakeVolumeLoader);
  imageLoader.registerImageLoader('fakeImageLoader', fakeImageLoader);
  metaData.addProvider(fakeMetaDataProvider, 10000);
}

/**
 * This is one example of how to import peer modules that works with webpack
 * It in fact just uses the default import from the browser, so it should work
 * on any standards compliant ecmascript environment.
 */
export async function peerImport(moduleId) {
  if (moduleId === 'dicom-microscopy-viewer') {
    return importGlobal(
      '/dicom-microscopy-viewer/dicomMicroscopyViewer.min.js',
      'dicomMicroscopyViewer'
    );
  }

  if (moduleId === '@icr/polyseg-wasm') {
    return import('@icr/polyseg-wasm');
  }
}

async function importGlobal(path, globalName) {
  await import(/* webpackIgnore: true */ path);
  return window[globalName];
}
