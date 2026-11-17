import type { PlanarViewport, Types } from '@cornerstonejs/core';
import {
  RenderingEngine,
  getRenderingEngine,
  Enums,
  utilities,
  viewportProjection,
} from '@cornerstonejs/core';
import {
  initDemo,
  createImageIdsAndCacheMetaData,
  setTitleAndDescription,
  addButtonToToolbar,
  camera as cameraHelpers,
  ctVoiRange,
} from '../../../../utils/demo/helpers';

// This is for debugging purposes
console.warn(
  'Click on index.ts to open source code for this example --------->'
);

const { ViewportType } = Enums;
const displaySetId = 'stackEvents:ct';

// ======== Constants ======= //
const renderingEngineId = 'myRenderingEngine';
const viewportId = 'CT_STACK';

// ======== Set up page ======== //
setTitleAndDescription(
  'Stack Events',
  'Shows events emitted by Cornerstone Stack Viewports.'
);

const content = document.getElementById('content');
const element = document.createElement('div');
element.id = 'cornerstone-element';
element.style.width = '512px';
element.style.height = '512px';

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

const { IMAGE_RENDERED, CAMERA_MODIFIED, NEW_IMAGE } = Enums.Events;

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

element.addEventListener(NEW_IMAGE, ((evt: Types.EventTypes.NewImageEvent) => {
  // Remove the image since then we serialize a bunch of pixelData to the screen.
  const { imageId, renderingEngineId, viewportId } = evt.detail;
  const detail = {
    imageId,
    renderingEngineId,
    viewportId,
    image: 'cornerstoneImageObject',
  };

  updateLastEvents(eventNumber, NEW_IMAGE, JSON.stringify(detail));
  eventNumber++;
}) as EventListener);

addButtonToToolbar({
  title: 'Set VOI Range',
  onClick: () => {
    // Get the rendering engine
    const renderingEngine = getRenderingEngine(renderingEngineId);

    // Get the stack viewport
    const viewport = renderingEngine.getViewport<PlanarViewport>(viewportId);

    // Set a range to highlight bones
    viewport.setDisplaySetPresentation(displaySetId, {
      voiRange: { upper: 2500, lower: -1500 },
    });

    viewport.render();
  },
});

addButtonToToolbar({
  title: 'Next Image',
  onClick: () => {
    // Get the rendering engine
    const renderingEngine = getRenderingEngine(renderingEngineId);

    // Get the stack viewport
    const viewport = renderingEngine.getViewport<PlanarViewport>(viewportId);

    // Get the current index of the image displayed
    const currentImageIdIndex = viewport.getCurrentImageIdIndex();

    // Increment the index, clamping to the last image if necessary
    const numImages = viewport.getImageIds().length;
    let newImageIdIndex = currentImageIdIndex + 1;

    newImageIdIndex = Math.min(newImageIdIndex, numImages - 1);

    // Set the new image index, the viewport itself does a re-render
    viewport.setImageIdIndex(newImageIdIndex);
  },
});

addButtonToToolbar({
  title: 'Previous Image',
  onClick: () => {
    // Get the rendering engine
    const renderingEngine = getRenderingEngine(renderingEngineId);

    // Get the stack viewport
    const viewport = renderingEngine.getViewport<PlanarViewport>(viewportId);

    // Get the current index of the image displayed
    const currentImageIdIndex = viewport.getCurrentImageIdIndex();

    // Increment the index, clamping to the first image if necessary
    let newImageIdIndex = currentImageIdIndex - 1;

    newImageIdIndex = Math.max(newImageIdIndex, 0);

    // Set the new image index, the viewport itself does a re-render
    viewport.setImageIdIndex(newImageIdIndex);
  },
});

addButtonToToolbar({
  title: 'Apply Random Zoom And Pan',
  onClick: () => {
    // Get the rendering engine
    const renderingEngine = getRenderingEngine(renderingEngineId);

    // Get the stack viewport
    const viewport = renderingEngine.getViewport<PlanarViewport>(viewportId);

    // Reset the camera so that we can set some pan and zoom relative to the
    // defaults for this demo. Note that changes could be relative instead.
    viewport.resetViewState();

    const presentation = cameraHelpers.getRandomZoomAndPanPresentation(
      viewport,
      50
    );
    const viewState =
      presentation &&
      viewportProjection.withPresentation(viewport, presentation);

    if (viewState) {
      viewport.setViewState(viewState);
    }
    viewport.render();
  },
});

addButtonToToolbar({
  title: 'Reset Viewport',
  onClick: () => {
    // Get the rendering engine
    const renderingEngine = getRenderingEngine(renderingEngineId);

    // Get the stack viewport
    const viewport = renderingEngine.getViewport<PlanarViewport>(viewportId);

    // Resets the viewport's camera
    viewport.resetViewState();
    // Resets the viewport's properties
    viewport.resetDisplaySetPresentation(displaySetId);
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
    wadoRsRoot: 'https://d14fa38qiwhyfd.cloudfront.net/dicomweb',
  });

  // Instantiate a rendering engine
  const renderingEngine = new RenderingEngine(renderingEngineId);

  // Create a stack viewport

  const viewportInput = {
    viewportId,
    type: ViewportType.PLANAR_NEXT,
    element,
    defaultOptions: {
      background: [0.2, 0, 0.2] as Types.Point3,
    },
  };

  renderingEngine.enableElement(viewportInput);

  // Get the stack viewport that was created
  const viewport = renderingEngine.getViewport<PlanarViewport>(viewportId);

  // Define a stack containing a single image
  const stack = [imageIds[0], imageIds[1], imageIds[2]];

  // Set the stack on the viewport
  utilities.genericViewportDisplaySetMetadataProvider.add(displaySetId, {
    kind: 'planar',
    imageIds: stack,
    initialImageIdIndex: 0,
  });

  await viewport.setDisplaySets({ displaySetId });

  // Set the VOI of the stack
  viewport.setDisplaySetPresentation(displaySetId, { voiRange: ctVoiRange });

  // Render the image
  viewport.render();
}

run();
