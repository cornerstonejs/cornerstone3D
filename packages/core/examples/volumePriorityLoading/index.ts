import {
  RenderingEngine,
  Types,
  Enums,
  volumeLoader,
  imageLoadPoolManager,
  CONSTANTS,
} from '@cornerstonejs/core';
import {
  initDemo,
  createImageIdsAndCacheMetaData,
  setTitleAndDescription,
  setPetColorMapTransferFunctionForVolumeActor,
  setCtTransferFunctionForVolumeActor,
} from '../../../../utils/demo/helpers';

// This is for debugging purposes
console.warn(
  'Click on index.ts to open source code for this example --------->'
);

const { ViewportType } = Enums;

// Define unique ids for the volumes
const volumeLoaderScheme = 'cornerstoneStreamingImageVolume'; // Loader id which defines which volume loader to use
const ctVolumeName = 'CT_VOLUME_ID'; // Id of the volume less loader prefix
const ctVolumeId = `${volumeLoaderScheme}:${ctVolumeName}`; // VolumeId with loader id + volume id

// Define a unique id for the volume
const ptVolumeName = 'PT_VOLUME_ID';
const ptVolumeId = `${volumeLoaderScheme}:${ptVolumeName}`;

// ======== Set up page ======== //
setTitleAndDescription(
  'Custom Priority Loading Order',
  'Here we demonstrate loading frames in a custom order rather loading volumes sequentially as happens by default'
);

const content = document.getElementById('content');
const element = document.createElement('div');
element.id = 'cornerstone-element';
element.style.width = '500px';
element.style.height = '500px';

content.appendChild(element);
// ============================= //

function generateRequests(customOrderedRequests, ctRequests, ptRequests) {
  const requests = [];
  const requestType = 'prefetch';
  const priority = 0;

  for (let i = 0; i < customOrderedRequests.length; i++) {
    const { imageId } = customOrderedRequests[i];
    const additionalDetails = { volumeId: '' };

    const ctRequest = ctRequests.filter((req) => req.imageId === imageId);

    // if ct request
    if (ctRequest.length) {
      additionalDetails.volumeId = ctVolumeId;
      const { callLoadImage, imageId, imageIdIndex, options } = ctRequest[0];
      requests.push({
        callLoadImage: callLoadImage.bind(this, imageId, imageIdIndex, options),
        requestType,
        additionalDetails,
        priority,
      });
    }

    const ptRequest = ptRequests.filter((req) => req.imageId === imageId);

    // if pet request
    if (ptRequest.length) {
      additionalDetails.volumeId = ptVolumeId;
      const { callLoadImage, imageId, imageIdIndex, options } = ptRequest[0];
      requests.push({
        callLoadImage: callLoadImage.bind(this, imageId, imageIdIndex, options),
        requestType,
        additionalDetails,
        priority,
      });
    }
  }

  return requests;
}

/**
 * Runs the demo
 */
async function run() {
  // Init Cornerstone and related libraries
  await initDemo();

  const wadoRsRoot = 'https://d3t6nz73ql33tx.cloudfront.net/dicomweb';
  const StudyInstanceUID =
    '1.3.6.1.4.1.14519.5.2.1.7009.2403.334240657131972136850343327463';

  // Get Cornerstone imageIds and fetch metadata into RAM
  const ctImageIds = await createImageIdsAndCacheMetaData({
    StudyInstanceUID,
    SeriesInstanceUID:
      '1.3.6.1.4.1.14519.5.2.1.7009.2403.226151125820845824875394858561',
    wadoRsRoot,
  });

  const ptImageIds = await createImageIdsAndCacheMetaData({
    StudyInstanceUID,
    SeriesInstanceUID:
      '1.3.6.1.4.1.14519.5.2.1.7009.2403.879445243400782656317561081015',
    wadoRsRoot,
  });

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

  // Define a volume in memory
  const ctVolume = await volumeLoader.createAndCacheVolume(ctVolumeId, {
    imageIds: ctImageIds,
  });

  // Define a volume in memory
  const ptVolume = await volumeLoader.createAndCacheVolume(ptVolumeId, {
    imageIds: ptImageIds,
  });

  // Set the volume on the viewport
  viewport.setVolumes([
    { volumeId: ctVolumeId, callback: setCtTransferFunctionForVolumeActor },
    {
      volumeId: ptVolumeId,
      callback: setPetColorMapTransferFunctionForVolumeActor,
    },
  ]);

  const ctRequests = ctVolume.getImageLoadRequests();
  const ptRequests = ptVolume.getImageLoadRequests();

  // Alternate requests between volumes. This is a basic example, you could:
  // - Take more care to load equal regions of space between fused volumes, where dimensions are different.
  // - Load from the middle outwards instead of loading superior to inferior.
  // - Load slices that you know are of clinical interest first (e.g. those that have been annotated/segmented previously)
  const customOrderedRequests = [];

  const maxFrames = Math.max(ctRequests.length, ptRequests.length);

  for (let i = 0; i < maxFrames; i++) {
    if (ctRequests[i]) customOrderedRequests.push(ctRequests[i]);
    if (ptRequests[i]) customOrderedRequests.push(ptRequests[i]);
  }

  const requests = generateRequests(
    customOrderedRequests,
    ctRequests,
    ptRequests
  );

  // adding requests to the imageLoadPoolManager
  requests.forEach((request) => {
    const { callLoadImage, requestType, additionalDetails, priority } = request;
    imageLoadPoolManager.addRequest(
      callLoadImage,
      requestType,
      additionalDetails,
      priority
    );
  });

  // Render the image
  viewport.render();
}

run();
