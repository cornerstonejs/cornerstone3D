import {
  RenderingEngine,
  Types,
  Enums,
  getRenderingEngine,
} from '@cornerstonejs/core';
import {
  initDemo,
  setTitleAndDescription,
  addButtonToToolbar,
} from '../../../../utils/demo/helpers/index.js';

// This is for debugging purposes
console.warn(
  'Click on index.ts to open source code for this example --------->'
);

const { ViewportType, Events } = Enums;

// ======== Constants ======= //
const renderingEngineId = 'myRenderingEngine';
const viewportId = 'videoViewport';

// ======== Set up page ======== //
setTitleAndDescription(
  'Video Viewport API',
  'Demonstrates how to interact with a Video viewport.'
);

const content = document.getElementById('content');
const element = document.createElement('div');
element.id = 'cornerstone-element';
element.style.width = '500px';
element.style.height = '500px';

content.appendChild(element);

const info = document.createElement('div');
content.appendChild(info);

const rotationInfo = document.createElement('div');
info.appendChild(rotationInfo);

const flipHorizontalInfo = document.createElement('div');
info.appendChild(flipHorizontalInfo);

const flipVerticalInfo = document.createElement('div');
info.appendChild(flipVerticalInfo);

element.addEventListener(Events.CAMERA_MODIFIED, (_) => {
  // Get the rendering engine
  const renderingEngine = getRenderingEngine(renderingEngineId);

  // Get the stack viewport
  const viewport = <Types.IStackViewport>(
    renderingEngine.getViewport(viewportId)
  );

  if (!viewport) {
    return;
  }

  const { flipHorizontal, flipVertical } = viewport.getCamera();
  const { rotation } = viewport.getProperties();

  rotationInfo.innerText = `Rotation: ${Math.round(rotation)}`;
  flipHorizontalInfo.innerText = `Flip horizontal: ${flipHorizontal}`;
  flipVerticalInfo.innerText = `Flip vertical: ${flipVertical}`;
});

addButtonToToolbar({
  title: 'Play',
  onClick: () => {
    // Get the rendering engine
    const renderingEngine = getRenderingEngine(renderingEngineId);

    // Get the stack viewport
    const viewport = <Types.IVideoViewport>(
      renderingEngine.getViewport(viewportId)
    );

    // Set a range to highlight bones
    viewport.play();
  },
});

addButtonToToolbar({
  title: 'Pause',
  onClick: () => {
    // Get the rendering engine
    const renderingEngine = getRenderingEngine(renderingEngineId);

    // Get the stack viewport
    const viewport = <Types.IVideoViewport>(
      renderingEngine.getViewport(viewportId)
    );

    // Set a range to highlight bones
    viewport.pause();
  },
});

/**
 * Runs the demo
 */
async function run() {
  // Init Cornerstone and related libraries
  await initDemo();

  // Instantiate a rendering engine
  const renderingEngine = new RenderingEngine(renderingEngineId);

  // Create a stack viewport

  const viewportInput = {
    viewportId,
    type: ViewportType.VIDEO,
    element,
    defaultOptions: {
      background: <Types.Point3>[0.2, 0, 0.2],
    },
  };

  renderingEngine.enableElement(viewportInput);

  // Get the stack viewport that was created
  const viewport = <Types.IVideoViewport>(
    renderingEngine.getViewport(viewportId)
  );

  // Set the stack on the viewport
  await viewport.setVideoURL(
    'https://ohif-assets.s3.us-east-2.amazonaws.com/video/rendered.mp4'
  );

  // Set the VOI of the stack
  // viewport.setProperties({ voiRange: ctVoiRange });

  // Render the image
  viewport.play();
}

run();
