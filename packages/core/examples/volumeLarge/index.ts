import type { Types } from '@cornerstonejs/core';
import {
  RenderingEngine,
  Enums,
  volumeLoader,
  setConfiguration,
  getConfiguration,
  cache,
} from '@cornerstonejs/core';
import {
  initDemo,
  createImageIdsAndCacheMetaData,
  setTitleAndDescription,
  setCtTransferFunctionForVolumeActor,
  addButtonToToolbar,
  addToggleButtonToToolbar,
} from '../../../../utils/demo/helpers';

// This is for debugging purposes
console.warn(
  'Click on index.ts to open source code for this example --------->'
);

const { ViewportType } = Enums;

// ======== Set up page ======== //
setTitleAndDescription(
  'Large Volume Load',
  'Displays a large volume in a viewport (>2 gb).'
);

// Define a unique id for the volume
const volumeName = 'LargeVolume_Float32_Webassembly'; // Id of the volume less loader prefix
const volumeName16 = 'LargeVolume_Float16'; // Id of hte volume using Float16
const volumeLoaderScheme = 'cornerstoneStreamingImageVolume'; // Loader id which defines which volume loader to use
const volumeId = `${volumeLoaderScheme}:${volumeName}`; // VolumeId with loader id + volume id
const volumeId16 = `${volumeLoaderScheme}:${volumeName16}`;
let imageIds, viewport, renderingEngine;
const renderingEngineId = 'myRenderingEngine';
const viewportId = 'CT_SAGITTAL_STACK';
// 16 gb cache size
const LargeCacheSize = 16 * 1024 * 1024 * 1024;

const content = document.getElementById('content');
const element = document.createElement('div');
element.id = 'cornerstone-element';
element.style.width = '500px';
element.style.height = '500px';

content.appendChild(element);
// ============================= //

addToggleButtonToToolbar({
  title: 'Load 16 Int',
  defaultToggle: false,
  onClick: (toggle) => {
    cache.purgeCache();
    if (toggle) {
      loadImage16Float();
    } else {
      loadImage32Float();
    }
  },
});

async function loadImage32Float() {
  console.log('Loading image 32 float');
  renderingEngine.disableElement(viewportId);

  const viewportInput = {
    viewportId,
    type: ViewportType.ORTHOGRAPHIC,
    element,
    defaultOptions: {
      orientation: Enums.OrientationAxis.SAGITTAL,
      background: [0.2, 0, 0.2] as Types.Point3,
    },
  };
  renderingEngine.enableElement(viewportInput);

  // Get the volume viewport that was created
  viewport = renderingEngine.getViewport(viewportId) as Types.IVolumeViewport;

  setTimeout(async () => {
    const volume = cache.getVolume(volumeId);
    // Set the volume on the viewport
    viewport.setVolumes([
      { volumeId, callback: setCtTransferFunctionForVolumeActor },
    ]);

    console.log('And now rendering');
    // Render the image
    viewport.render();
  }, 100);
}

async function loadImage16Float() {
  console.log('Loading image 16 int');
  renderingEngine.disableElement(viewportId);

  const viewportInput = {
    viewportId,
    type: ViewportType.ORTHOGRAPHIC,
    element,
    defaultOptions: {
      orientation: Enums.OrientationAxis.SAGITTAL,
      background: [0, 0, 0.2] as Types.Point3,
    },
  };
  renderingEngine.enableElement(viewportInput);

  // Get the volume viewport that was created
  viewport = renderingEngine.getViewport(viewportId) as Types.IVolumeViewport;

  setTimeout(async () => {
    cache.setMaxCacheSize(LargeCacheSize);
    const currentConfig = getConfiguration();
    setConfiguration({
      ...currentConfig,
      rendering: {
        ...currentConfig.rendering,
      },
    });

    const volume =
      cache.getVolume(volumeId16) ||
      (await volumeLoader.createAndCacheVolume(volumeId16, {
        imageIds,
      }));

    // Set the volume to load
    // @ts-ignore
    volume.load();

    // Set the volume on the viewport
    viewport.setVolumes([
      { volumeId: volumeId16, callback: setCtTransferFunctionForVolumeActor },
    ]);

    // Render the image
    viewport.render();
  }, 100);
}

/**
 * Runs the demo
 */
async function run() {
  // Init Cornerstone and related libraries
  await initDemo();

  // Get Cornerstone imageIds and fetch metadata into RAM
  // TODO - move the study into a shared context.
  imageIds = await createImageIdsAndCacheMetaData({
    StudyInstanceUID: '1.2.250.1.90.4.3706890026.20240517115154.2024.1',
    SeriesInstanceUID: '1.2.250.1.90.3.3384839960.20240517203917.8108.53271',
    wadoRsRoot: 'http://localhost/dicom-web',
  });

  // Instantiate a rendering engine
  renderingEngine = new RenderingEngine(renderingEngineId);

  // Create a volume viewport
  const viewportInput = {
    viewportId,
    type: ViewportType.ORTHOGRAPHIC,
    element,
    defaultOptions: {
      orientation: Enums.OrientationAxis.SAGITTAL,
      background: [0.2, 0, 0.2] as Types.Point3,
    },
  };

  renderingEngine.enableElement(viewportInput);

  // Get the stack viewport that was created
  viewport = renderingEngine.getViewport(viewportId) as Types.IVolumeViewport;

  // Define a volume in memory
  const volume = await volumeLoader.createAndCacheVolume(volumeId, {
    imageIds,
  });

  // Set the volume to load
  volume.load();

  // Set the volume on the viewport
  viewport.setVolumes([
    { volumeId, callback: setCtTransferFunctionForVolumeActor },
  ]);

  // Render the image
  viewport.render();
}

run();
