import {
  RenderingEngine,
  Types,
  Enums,
  volumeLoader,
  imageLoader,
} from '@cornerstonejs/core';
import {
  initDemo,
  setTitleAndDescription,
  setCtTransferFunctionForVolumeActor,
} from '../../../../utils/demo/helpers';
import instanceUIDs from './instanceUIDs.js';

// This is for debugging purposes
console.warn(
  'Click on index.ts to open source code for this example --------->'
);

const { ViewportType } = Enums;

// ======== Set up page ======== //
setTitleAndDescription(
  'Basic Volume using streaming WADOURI',
  'Displays a DICOM series in a Volume viewport.'
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

  const seriesUID =
    '1.3.6.1.4.1.14519.5.2.1.7009.2403.226151125820845824875394858561';
  const studyUID =
    '1.3.6.1.4.1.14519.5.2.1.7009.2403.334240657131972136850343327463';
  const wadoURIRoot = `https://server.dcmjs.org/dcm4chee-arc/aets/DCM4CHEE/wado?requestType=WADO&studyUID=${studyUID}&seriesUID=${seriesUID}&contentType=application%2Fdicom`;

  const imageIds = instanceUIDs.map((uid) => {
    return `wadouri:${wadoURIRoot}&objectUID=${uid}`;
  });

  /**
   * Preload first, middle, and last image metadata as these are the images the
   * current streaming image loader may explicitly request metadata from. The
   * last image metadata would only be specifically requested if the imageId
   * array order is reversed in the `sortImageIdsAndGetSpacing.ts` file.
   */
  const middleImageIndex = Math.floor(imageIds.length / 2);
  const indexesToPrefetch = [0, middleImageIndex, imageIds.length - 1];
  for (let i of indexesToPrefetch) {
    await imageLoader.loadImage(imageIds[i], { skipCreateImage: true }).then(
      () => {
        console.log(`image prefetched ${i}`);
      },
      (error) => {
        console.error(error);
      }
    );
  }

  // Instantiate a rendering engine
  const renderingEngineId = 'myRenderingEngine';
  const renderingEngine = new RenderingEngine(renderingEngineId);

  // Create a stack viewport
  const viewportId = 'CT_SAGITTAL_STACK';
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
  const volumeName = 'CT_VOLUME_ID'; // Id of the volume less loader prefix
  const volumeLoaderScheme = 'cornerstoneStreamingImageVolume'; // Loader id which defines which volume loader to use
  const volumeId = `${volumeLoaderScheme}:${volumeName}`; // VolumeId with loader id + volume id

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
