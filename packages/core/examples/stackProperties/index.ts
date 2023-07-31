import {
  RenderingEngine,
  Types,
  Enums,
  getRenderingEngine,
} from '@cornerstonejs/core';
import {
  initDemo,
  createImageIdsAndCacheMetaData,
  setTitleAndDescription,
  addButtonToToolbar,
  ctVoiRange,
} from '../../../../utils/demo/helpers';

// This is for debugging purposes
console.warn(
  'Click on index.ts to open source code for this example --------->'
);

const { ViewportType, Events } = Enums;

// ======== Constants ======= //
const renderingEngineId = 'myRenderingEngine';
const viewportId = 'CT_STACK';

// ======== Set up page ======== //
setTitleAndDescription(
  'Stack Viewport Properties',
  'Demonstrates how to interact with a Stack viewport properties'
);

const content = document.getElementById('content');
const element = document.createElement('div');
element.id = 'cornerstone-element';
element.style.width = '500px';
element.style.height = '500px';

content.appendChild(element);

const info = document.createElement('div');
content.appendChild(info);

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
});

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
  title: 'SetProperties only for current image',
  onClick: () => {
    // Get the rendering engine
    const renderingEngine = getRenderingEngine(renderingEngineId);

    // Get the stack viewport
    const viewport = <Types.IStackViewport>(
      renderingEngine.getViewport(viewportId)
    );

    // Set a range to highlight bones
    viewport.setDefaultProperties(
      { voiRange: { upper: 2500, lower: -1500 }, colormap: { name: 'hsv' } },
      viewport.getCurrentImageIdIndex()
    );
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

  // Define a stack containing a few images
  const stack = [
    imageIds[0],
    imageIds[1],
    imageIds[2],
    imageIds[3],
    imageIds[4],
  ];

  // Set the stack on the viewport
  await viewport.setStack(stack);

  // Set the default properties of the viewport
  viewport.setProperties({
    voiRange: { upper: 240, lower: -160 },
    colormap: { name: 'Grayscale' },
  });

  // Render the image
  viewport.render();
}

run();
