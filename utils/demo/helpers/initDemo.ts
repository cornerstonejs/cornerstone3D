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
import * as polySeg from '@cornerstonejs/polymorphic-segmentation';
import {
  applyUrlParameterOverridesToDemoConfig,
  applyViewportTypeOverride,
} from './exampleParameters';

window.cornerstone = cornerstone;
window.cornerstoneTools = cornerstoneTools;

// Examples are served from the root by the example dev server and from
// /live-examples/ on the docs site, and each deployment copies the wasm
// binaries it needs (onnxruntime-web, dicom-microscopy-viewer) next to the
// page. Declaring the page's own directory as the public URL is what makes
// those copies findable from either location; a page that declares its own
// PUBLIC_URL keeps it. Examples are single pages rather than routed
// applications, so the page directory *is* the application root here.
window.PUBLIC_URL ||= window.location.pathname.replace(/[^/]*$/, '');

export default async function initDemo(config: any = {}) {
  const urlParams = new URLSearchParams(window.location.search);
  const debugEnabled = urlParams.get('debug') === 'true';

  // Apply URL parameter overrides (cpu thresholds, viewport V2 flag, etc.)
  let demoConfig = applyUrlParameterOverridesToDemoConfig(config);
  demoConfig = applyViewportTypeOverride(demoConfig);
  const toolsConfig = demoConfig?.tools || {};

  initProviders();
  cornerstoneDICOMImageLoader.init({
    ...(demoConfig?.dicomImageLoader || {}),
    ...(demoConfig?.useLegacyMetadataProvider !== undefined
      ? { useLegacyMetadataProvider: demoConfig.useLegacyMetadataProvider }
      : {}),
  });
  initVolumeLoader();

  await csRenderInit({
    peerImport,
    ...(demoConfig?.core
      ? {
          ...demoConfig.core,
          debug: {
            statsOverlay: debugEnabled,
          },
        }
      : {
          debug: {
            statsOverlay: debugEnabled,
          },
        }),
  });
  await csToolsInit({
    ...toolsConfig,
    addons: {
      polySeg,
      ...(toolsConfig.addons || {}),
    },
  });

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
    // The microscopy viewer loads relative to the public URL, declared above.
    // Use a relative library path that includes the component name
    window.PUBLIC_LIB_URL ||= './${component}/';
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
