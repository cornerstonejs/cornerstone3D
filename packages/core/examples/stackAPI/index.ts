import type { PlanarViewport, Types } from '@cornerstonejs/core';
import {
  RenderingEngine,
  Enums,
  getRenderingEngine,
  viewportProjection,
  displaySetRegistry,
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

const { ViewportType, Events } = Enums;
const displaySetId = 'stackAPI:ct';

// ======== Constants ======= //
const renderingEngineId = 'myRenderingEngine';
const viewportId = 'CT_STACK';

// ======== Set up page ======== //
setTitleAndDescription(
  'Stack Viewport API',
  'Demonstrates how to interact with a Stack viewport.'
);

const content = document.getElementById('content');
const element = document.createElement('div');
element.id = 'cornerstone-element';
element.style.width = '512px';
element.style.height = '512px';

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
  const viewport = renderingEngine.getViewport<PlanarViewport>(viewportId);

  if (!viewport) {
    return;
  }

  const { flipHorizontal = false, flipVertical = false } =
    viewport.getViewState();
  const { rotation = 0 } =
    viewportProjection.getFraming(viewport, {
      selector: { rotation: true },
    }) ?? {};

  rotationInfo.innerText = `Rotation: ${Math.round(rotation)}`;
  flipHorizontalInfo.innerText = `Flip horizontal: ${flipHorizontal}`;
  flipVerticalInfo.innerText = `Flip vertical: ${flipVertical}`;
});

addButtonToToolbar({
  title: 'Set VOI Range',
  onClick: () => {
    // Get the rendering engine
    const renderingEngine = getRenderingEngine(renderingEngineId);

    // Get the stack viewport
    const viewport = renderingEngine.getViewport<PlanarViewport>(viewportId);

    // Set a range to highlight bones
    viewport.setDisplaySetAppearance(displaySetId, {
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
  title: 'Flip H',
  onClick: () => {
    // Get the rendering engine
    const renderingEngine = getRenderingEngine(renderingEngineId);

    // Get the stack viewport
    const viewport = renderingEngine.getViewport<PlanarViewport>(viewportId);

    const { flipHorizontal = false } = viewport.getViewState();
    viewport.setViewState({ flipHorizontal: !flipHorizontal });

    viewport.render();
  },
});

addButtonToToolbar({
  title: 'Flip V',
  onClick: () => {
    // Get the rendering engine
    const renderingEngine = getRenderingEngine(renderingEngineId);

    // Get the stack viewport
    const viewport = renderingEngine.getViewport<PlanarViewport>(viewportId);

    const { flipVertical = false } = viewport.getViewState();

    viewport.setViewState({ flipVertical: !flipVertical });

    viewport.render();
  },
});

addButtonToToolbar({
  title: 'Rotate Random',
  onClick: () => {
    // Get the rendering engine
    const renderingEngine = getRenderingEngine(renderingEngineId);

    // Get the stack viewport
    const viewport = renderingEngine.getViewport<PlanarViewport>(viewportId);

    const rotation = Math.random() * 360;

    const viewState = viewportProjection.withFraming(viewport, {
      rotation,
    });

    if (viewState) {
      viewport.setViewState(viewState);
    }

    viewport.render();
  },
});

addButtonToToolbar({
  title: 'Rotate Absolute 150',
  onClick: () => {
    // Get the rendering engine
    const renderingEngine = getRenderingEngine(renderingEngineId);

    // Get the stack viewport
    const viewport = renderingEngine.getViewport<PlanarViewport>(viewportId);

    const viewState = viewportProjection.withFraming(viewport, {
      rotation: 150,
    });

    if (viewState) {
      viewport.setViewState(viewState);
    }

    viewport.render();
  },
});

addButtonToToolbar({
  title: 'Rotate Delta 30',
  onClick: () => {
    // Get the rendering engine
    const renderingEngine = getRenderingEngine(renderingEngineId);

    // Get the stack viewport
    const viewport = renderingEngine.getViewport<PlanarViewport>(viewportId);

    const { rotation = 0 } =
      viewportProjection.getFraming(viewport, {
        selector: { rotation: true },
      }) ?? {};
    const viewState = viewportProjection.withFraming(viewport, {
      rotation: rotation + 30,
    });

    if (viewState) {
      viewport.setViewState(viewState);
    }

    viewport.render();
  },
});

addButtonToToolbar({
  title: 'Invert',
  onClick: () => {
    // Get the rendering engine
    const renderingEngine = getRenderingEngine(renderingEngineId);

    // Get the stack viewport
    const viewport = renderingEngine.getViewport<PlanarViewport>(viewportId);

    const invert =
      viewport.getDisplaySetAppearance(displaySetId)?.invert ??
      viewport.getDefaultInvert(displaySetId) ??
      false;
    viewport.setDisplaySetAppearance(displaySetId, { invert: !invert });

    viewport.render();
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
      presentation && viewportProjection.withFraming(viewport, presentation);

    if (viewState) {
      viewport.setViewState(viewState);
    }
    viewport.render();
  },
});

addButtonToToolbar({
  title: 'Apply Colormap',
  onClick: () => {
    // Get the rendering engine
    const renderingEngine = getRenderingEngine(renderingEngineId);

    // Get the stack viewport
    const viewport = renderingEngine.getViewport<PlanarViewport>(viewportId);

    viewport.setDisplaySetAppearance(displaySetId, {
      colormap: { name: 'hsv' },
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
    const viewport = renderingEngine.getViewport<PlanarViewport>(viewportId);

    // Resets the viewport's camera
    viewport.resetViewState();
    // Resets the viewport's properties
    viewport.resetDisplaySetAppearance(displaySetId);

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
    type: ViewportType.PLANAR,
    element,
    defaultOptions: {
      background: [0.2, 0, 0.2] as Types.Point3,
    },
  };

  renderingEngine.enableElement(viewportInput);

  // Get the stack viewport that was created
  const viewport = renderingEngine.getViewport<PlanarViewport>(viewportId);

  // Define a stack containing a few images
  const stack = [imageIds[0], imageIds[1], imageIds[2]];

  // Set the stack on the viewport
  displaySetRegistry.add(displaySetId, {
    imageIds: stack,
  });

  await viewport.setDisplaySets({
    displaySetId,
    options: { initialImageIdIndex: 0 },
  });

  // Set the VOI of the stack
  viewport.setDisplaySetAppearance(displaySetId, { voiRange: ctVoiRange });

  // Render the image
  viewport.render();
}

run();
