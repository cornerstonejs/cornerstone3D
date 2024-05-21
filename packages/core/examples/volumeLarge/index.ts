import {
  RenderingEngine,
  Types,
  Enums,
  volumeLoader,
  cache,
  CONSTANTS,
} from '@cornerstonejs/core';
import {
  initDemo,
  createImageIdsAndCacheMetaData,
  setTitleAndDescription,
  setCtTransferFunctionForVolumeActor,
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

const content = document.getElementById('content');
const element = document.createElement('div');
element.id = 'cornerstone-element';
element.style.width = '500px';
element.style.height = '500px';

content.appendChild(element);
// ============================= //

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
  const renderingEngineId = 'myRenderingEngine';
  const renderingEngine = new RenderingEngine(renderingEngineId);

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
