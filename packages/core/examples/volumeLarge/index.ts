import {
  RenderingEngine,
  Types,
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
      background: <Types.Point3>[0.2, 0, 0.2],
    },
  };
  renderingEngine.enableElement(viewportInput);

  // Get the volume viewport that was created
  viewport = <Types.IVolumeViewport>renderingEngine.getViewport(viewportId);

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
      background: <Types.Point3>[0, 0, 0.2],
    },
  };
  renderingEngine.enableElement(viewportInput);

  // Get the volume viewport that was created
  viewport = <Types.IVolumeViewport>renderingEngine.getViewport(viewportId);

  setTimeout(async () => {
    cache.setMaxCacheSize(LargeCacheSize);
    const currentConfig = getConfiguration();
    setConfiguration({
      ...currentConfig,
      rendering: {
        ...currentConfig.rendering,
        useNorm16Texture: true,
      },
    });

    const volume =
      cache.getVolume(volumeId16) ||
      (await volumeLoader.createAndCacheVolume(volumeId16, {
        imageIds,
      }));

    // Set the volume to load
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
  // const imageIds = await createImageIdsAndCacheMetaData({
  //   StudyInstanceUID: '1.2.250.1.90.4.3706890026.20240517115154.2024.1',
  //   SeriesInstanceUID: '1.2.250.1.90.3.3384839960.20240517203917.8108.53271',
  //   wadoRsRoot: 'http://localhost:5000/dicomweb',
  // });

  // Instantiate a rendering engine
  renderingEngine = new RenderingEngine(renderingEngineId);

  // Create a stack viewport
  const viewportId = 'CT_SAGITTAL';
  const viewportInput = {
    viewportId,
    type: ViewportType.ORTHOGRAPHIC,
    element,
    defaultOptions: {
      orientation: Enums.OrientationAxis.SAGITTAL,
      background: <Types.Point3>[0.2, 0, 0.2],
    },
  };

  renderingEngine.enableElement(viewportInput);

  // Get the stack viewport that was created
  const viewport = <Types.IVolumeViewport>(
    renderingEngine.getViewport(viewportId)
  );

  // Define a unique id for the volume
  const volumeId = 'CT_VOLUME_ID'; // Id of the volume less loader prefix
  // const volumeLoaderScheme = 'cornerstoneStreamingImageVolume'; // Loader id which defines which volume loader to use
  // const volumeId = `${volumeLoaderScheme}:${volumeName}`; // VolumeId with loader id + volume id

  // Define a volume in memory

  // 5 GB
  cache.setMaxCacheSize(5294967296);

  const dimensions = [750, 750, 1024] as Types.Point3;

  await volumeLoader.createLocalVolume(
    {
      dimensions,
      direction: [1, 0, 0, 0, 1, 0, 0, 0, 1],
      spacing: [1, 1, 1],
      origin: [0, 0, 0],
      // @ts-ignore
      metadata: {
        Columns: dimensions[0],
        Rows: dimensions[1],
        Modality: 'CT',
      },
      targetBuffer: {
        type: 'Float32Array',
        sharedArrayBuffer: true,
      },
    },
    volumeId
  );

  // Set the volume to load
  // volume.load();

  // Set the volume on the viewport
  viewport.setVolumes([
    { volumeId, callback: setCtTransferFunctionForVolumeActor },
  ]);

  // Render the image
  viewport.render();
}

run();
