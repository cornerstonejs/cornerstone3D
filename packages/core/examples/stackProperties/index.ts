import type { PlanarViewport, Types } from '@cornerstonejs/core';
import {
  RenderingEngine,
  Enums,
  getRenderingEngine,
  utilities,
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
const displaySetId = 'stackProperties:ct';

/**
 * The look that the example gives the stack after its mount. A next viewport
 * keeps no default properties, so the example keeps its own.
 */
const defaultPresentation = {
  voiRange: { upper: 200, lower: -300 },
  colormap: { name: 'Grayscale' },
};

/**
 * The looks that the example gave to single images, by image id.
 */
const imagePresentations = new Map<string, typeof defaultPresentation>();

/**
 * Replaces the look of the stack with the look of the image on display, or
 * with the default of the example when that image has none.
 */
function showDefaultPresentation(viewport: PlanarViewport) {
  viewport.resetDisplaySetPresentation(displaySetId);
  viewport.setDisplaySetPresentation(
    displaySetId,
    imagePresentations.get(viewport.getCurrentImageId()) ?? defaultPresentation
  );
}

// ======== Set up page ======== //
setTitleAndDescription(
  'Stack Viewport Properties',
  'Demonstrates how to interact with a Stack viewport properties'
);

const content = document.getElementById('content');
const element = document.createElement('div');
element.id = 'cornerstone-element';
element.style.width = '512px';
element.style.height = '512px';

content.appendChild(element);

const info = document.createElement('div');
content.appendChild(info);

element.addEventListener(Events.CAMERA_MODIFIED, (_) => {
  // Get the rendering engine
  const renderingEngine = getRenderingEngine(renderingEngineId);

  // Get the stack viewport
  const viewport = renderingEngine.getViewport<PlanarViewport>(viewportId);

  if (!viewport) {
    return;
  }
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
  title: 'Add Properties only for current imageID',
  onClick: () => {
    // Get the rendering engine
    const renderingEngine = getRenderingEngine(renderingEngineId);

    // Get the stack viewport
    const viewport = renderingEngine.getViewport<PlanarViewport>(viewportId);

    // Set a range to highlight bones
    const presentation = {
      voiRange: { upper: 2500, lower: -1500 },
      colormap: { name: 'hsv' },
    };

    imagePresentations.set(viewport.getCurrentImageId(), presentation);
    viewport.setDisplaySetPresentation(displaySetId, presentation);
  },
});

addButtonToToolbar({
  title: 'Remove current imageId Properties',
  onClick: () => {
    // Get the rendering engine
    const renderingEngine = getRenderingEngine(renderingEngineId);

    // Get the stack viewport
    const viewport = renderingEngine.getViewport<PlanarViewport>(viewportId);

    imagePresentations.delete(viewport.getCurrentImageId());
    showDefaultPresentation(viewport);
  },
});

addButtonToToolbar({
  title: 'Reset to Default Viewport Properties',
  onClick: () => {
    // Get the rendering engine
    const renderingEngine = getRenderingEngine(renderingEngineId);

    // Get the stack viewport
    const viewport = renderingEngine.getViewport<PlanarViewport>(viewportId);

    // Resets the viewport's camera
    viewport.resetViewState();
    // Resets the viewport's to its default properties
    showDefaultPresentation(viewport);
    viewport.render();
  },
});

addButtonToToolbar({
  title: 'Reset to metadata',
  onClick: () => {
    // Get the rendering engine
    const renderingEngine = getRenderingEngine(renderingEngineId);

    // Get the stack viewport
    const viewport = renderingEngine.getViewport<PlanarViewport>(viewportId);

    // Resets the viewport's camera
    viewport.resetViewState();
    // Resets the viewport's properties to image metadata
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
  const image1 = await createImageIdsAndCacheMetaData({
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

  // Define a stack containing a few images
  const stack = [image1[0], image1[1], image1[2], image1[3], image1[4]];

  // Set the stack on the viewport
  utilities.genericViewportDisplaySetMetadataProvider.add(displaySetId, {
    kind: 'planar',
    imageIds: stack,
    initialImageIdIndex: 0,
  });

  await viewport.setDisplaySets({ displaySetId });

  // Set the default properties of the viewport
  viewport.setDisplaySetPresentation(displaySetId, defaultPresentation);

  element.addEventListener(Events.STACK_NEW_IMAGE, () => {
    if (imagePresentations.size === 0) {
      return;
    }

    viewport.setDisplaySetPresentation(
      displaySetId,
      imagePresentations.get(viewport.getCurrentImageId()) ??
        defaultPresentation
    );
  });

  // Render the image
  viewport.render();
}

run();
