import {
  RenderingEngine,
  Types,
  getRenderingEngine,
  Enums,
} from '@cornerstonejs/core';
import {
  initDemo,
  createImageIdsAndCacheMetaData,
  setTitleAndDescription,
  addButtonToToolbar,
  ctVoiRange,
} from '../../../../utils/demo/helpers';
import { vec3 } from 'gl-matrix';

// This is for debugging purposes
console.warn(
  'Click on index.ts to open source code for this example --------->'
);

const { ViewportType } = Enums;

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

const { IMAGE_RENDERED, CAMERA_MODIFIED, STACK_NEW_IMAGE } = Enums.Events;

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

element.addEventListener(STACK_NEW_IMAGE, ((
  evt: Types.EventTypes.StackNewImageEvent
) => {
  // Remove the image since then we serialize a bunch of pixelData to the screen.
  const { imageId, renderingEngineId, viewportId } = evt.detail;
  const detail = {
    imageId,
    renderingEngineId,
    viewportId,
    image: 'cornerstoneImageObject',
  };

  updateLastEvents(eventNumber, STACK_NEW_IMAGE, JSON.stringify(detail));
  eventNumber++;
}) as EventListener);

addButtonToToolbar({
  title: 'Set VOI Range',
  onClick: () => {
    // Get the rendering engine
    const renderingEngine = getRenderingEngine(renderingEngineId);

    // Get the stack viewport
    const viewport = <Types.IStackViewport>(
      renderingEngine.getViewport(viewportId)
    );

    // Set a range to highlight bones
    viewport.setProperties({ voiRange: { upper: 2500, lower: -1500 } });

    viewport.render();
  },
});

addButtonToToolbar({
  title: 'Next Image',
  onClick: () => {
    // Get the rendering engine
    const renderingEngine = getRenderingEngine(renderingEngineId);

    // Get the stack viewport
    const viewport = <Types.IStackViewport>(
      renderingEngine.getViewport(viewportId)
    );

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
    const viewport = <Types.IStackViewport>(
      renderingEngine.getViewport(viewportId)
    );

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
    const viewport = <Types.IStackViewport>(
      renderingEngine.getViewport(viewportId)
    );

    // Reset the camera so that we can set some pan and zoom relative to the
    // defaults for this demo. Note that changes could be relative instead.
    viewport.resetCamera();

    // Get the current camera properties
    const camera = viewport.getCamera();
    const { viewUp, viewPlaneNormal, parallelScale, position, focalPoint } =
      camera;

    // Modify the zoom by some factor
    const randomModifier = 0.5 + Math.random() - 0.5;
    const newParallelScale = parallelScale * randomModifier;

    // Move the camera in plane by some random number
    const viewRight = vec3.create(); // Get the X direction of the viewport

    vec3.cross(viewRight, <vec3>viewUp, <vec3>viewPlaneNormal);

    const randomPanX = 50 * (2.0 * Math.random() - 1);
    const randomPanY = 50 * (2.0 * Math.random() - 1);

    const diff = [0, 0, 0];

    // Pan X
    for (let i = 0; i <= 2; i++) {
      diff[i] += viewRight[i] * randomPanX;
    }

    // Pan Y
    for (let i = 0; i <= 2; i++) {
      diff[i] += viewUp[i] * randomPanY;
    }

    const newPosition = [];
    const newFocalPoint = [];

    for (let i = 0; i <= 2; i++) {
      newPosition[i] = position[i] + diff[i];
      newFocalPoint[i] = focalPoint[i] + diff[i];
    }

    viewport.setCamera({
      parallelScale: newParallelScale,
      position: <Types.Point3>newPosition,
      focalPoint: <Types.Point3>newFocalPoint,
    });
    viewport.render();
  },
});

addButtonToToolbar({
  title: 'Reset Viewport',
  onClick: () => {
    // Get the rendering engine
    const renderingEngine = getRenderingEngine(renderingEngineId);

    // Get the stack viewport
    const viewport = <Types.IStackViewport>(
      renderingEngine.getViewport(viewportId)
    );

    // Resets the viewport's camera
    viewport.resetCamera();
    // Resets the viewport's properties
    viewport.resetProperties();
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
    type: ViewportType.STACK,
    element,
    defaultOptions: {
      background: <Types.Point3>[0.2, 0, 0.2],
    },
  };

  renderingEngine.enableElement(viewportInput);

  // Get the stack viewport that was created
  const viewport = <Types.IStackViewport>(
    renderingEngine.getViewport(viewportId)
  );

  // Define a stack containing a single image
  const stack = [imageIds[0], imageIds[1], imageIds[2]];

  // Set the stack on the viewport
  await viewport.setStack(stack);

  // Set the VOI of the stack
  viewport.setProperties({ voiRange: ctVoiRange });

  // Render the image
  viewport.render();
}

run();
