import initProviders from './initProviders';
import initCornerstoneDICOMImageLoader from './initCornerstoneDICOMImageLoader';
import initVolumeLoader from './initVolumeLoader';
import { init as csRenderInit } from '@cornerstonejs/core';
import { init as csToolsInit } from '@cornerstonejs/tools';

export default async function initDemo() {
  initProviders();
  initCornerstoneDICOMImageLoader();
  initVolumeLoader();
  await csRenderInit({ peerImport });
  await csToolsInit();
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
}

async function importGlobal(path, globalName) {
  await import(/* webpackIgnore: true */ path);
  return window[globalName];
}
