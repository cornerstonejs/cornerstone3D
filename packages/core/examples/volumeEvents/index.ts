import {
  RenderingEngine,
  Types,
  getRenderingEngine,
  volumeLoader,
  Enums,
  CONSTANTS,
} from '@cornerstonejs/core';
import {
  initDemo,
  createImageIdsAndCacheMetaData,
  setTitleAndDescription,
  addButtonToToolbar,
  camera as cameraHelpers,
  setCtTransferFunctionForVolumeActor,
} from '../../../../utils/demo/helpers';

// This is for debugging purposes
console.warn(
  'Click on index.ts to open source code for this example --------->'
);

const { ViewportType } = Enums;

const renderingEngineId = 'myRenderingEngine';
const viewportId = 'CT_SAGITTAL_STACK';

// Define a unique id for the volume
const volumeName = 'CT_VOLUME_ID'; // Id of the volume less loader prefix
const volumeLoaderScheme = 'cornerstoneStreamingImageVolume'; // Loader id which defines which volume loader to use
const volumeId = `${volumeLoaderScheme}:${volumeName}`; // VolumeId with loader id + volume id

// ======== Set up page ======== //
setTitleAndDescription(
  'Volume Events',
  'Shows events emitted by Cornerstone Volume Viewports.'
);

const content = document.getElementById('content');
const element = document.createElement('div');
element.id = 'cornerstone-element';
element.style.width = '500px';
element.style.height = '500px';

content.appendChild(element);

const lastEvents = [];
const lastEventsDiv = document.createElement('div');

content.appendChild(lastEventsDiv);

function updateLastEvents(number, eventName, detail) {
  if (lastEvents.length > 4) {
    lastEvents.pop();
  }

  lastEvents.unshift({ number, eventName, detail });

  // Display
  lastEventsDiv.innerHTML = '';

  lastEvents.forEach((le) => {
    const element = document.createElement('p');

    element.style.border = '1px solid black';
    element.innerText = le.number + ' ' + le.eventName + '\n\n' + le.detail;

    lastEventsDiv.appendChild(element);
  });
}

let eventNumber = 1;

const { IMAGE_RENDERED, CAMERA_MODIFIED, VOLUME_NEW_IMAGE } = Enums.Events;

element.addEventListener(IMAGE_RENDERED, ((
  evt: Types.EventTypes.ImageRenderedEvent
) => {
  updateLastEvents(eventNumber, IMAGE_RENDERED, JSON.stringify(evt.detail));
  eventNumber++;
}) as EventListener);

element.addEventListener(CAMERA_MODIFIED, ((
  evt: Types.EventTypes.CameraModifiedEvent
) => {
  updateLastEvents(eventNumber, CAMERA_MODIFIED, JSON.stringify(evt.detail));
  eventNumber++;
}) as EventListener);

element.addEventListener(VOLUME_NEW_IMAGE, ((
  evt: Types.EventTypes.VolumeNewImageEvent
) => {
  const { imageIndex, renderingEngineId, viewportId } = evt.detail;
  const detail = {
    imageIndex,
    renderingEngineId,
    viewportId,
  };

  updateLastEvents(eventNumber, VOLUME_NEW_IMAGE, JSON.stringify(detail));
  eventNumber++;
}) as EventListener);

// ============================= //

// TODO -> Maybe some of these implementations should be pushed down to some API

// Buttons
addButtonToToolbar({
  title: 'Set VOI Range',
  onClick: () => {
    // Get the rendering engine
    const renderingEngine = getRenderingEngine(renderingEngineId);

    // Get the stack viewport
    const viewport = <Types.IVolumeViewport>(
      renderingEngine.getViewport(viewportId)
    );

    viewport.setProperties({ voiRange: { lower: -1500, upper: 2500 } });
    viewport.render();
  },
});

addButtonToToolbar({
  title: 'Apply Random Zoom And Pan',
  onClick: () => {
    // Get the rendering engine
    const renderingEngine = getRenderingEngine(renderingEngineId);

    // Get the stack viewport
    const viewport = <Types.IVolumeViewport>(
      renderingEngine.getViewport(viewportId)
    );

    // Reset the camera so that we can set some pan and zoom relative to the
    // defaults for this demo. Note that changes could be relative instead.
    viewport.resetCamera();

    // Get the current camera properties
    const camera = viewport.getCamera();

    const { parallelScale, position, focalPoint } =
      cameraHelpers.getRandomlyTranslatedAndZoomedCameraProperties(camera, 50);

    viewport.setCamera({
      parallelScale,
      position: <Types.Point3>position,
      focalPoint: <Types.Point3>focalPoint,
    });
    viewport.render();
  },
});

addButtonToToolbar({
  title: 'Reset Viewport',
  onClick: () => {
    // Get the rendering engine
    const renderingEngine = getRenderingEngine(renderingEngineId);

    // Get the volume viewport
    const viewport = <Types.IVolumeViewport>(
      renderingEngine.getViewport(viewportId)
    );

    // Resets the viewport's camera
    viewport.resetCamera();
    // TODO reset the viewport properties, we don't have API for this.

    viewport.render();
  },
});

/**
 * Runs the demo
 */
async function run() {
  // Init Cornerstone and related libraries
  await initDemo();

  // Get Cornerstone imageIds and fetch metadata into RAM
  const imageIds = await createImageIdsAndCacheMetaData({
    StudyInstanceUID:
      '1.3.6.1.4.1.14519.5.2.1.7009.2403.334240657131972136850343327463',
    SeriesInstanceUID:
      '1.3.6.1.4.1.14519.5.2.1.7009.2403.226151125820845824875394858561',
    wadoRsRoot: 'https://d3t6nz73ql33tx.cloudfront.net/dicomweb',
  });

  // Instantiate a rendering engine
  const renderingEngine = new RenderingEngine(renderingEngineId);

  // Create a stack viewport
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
