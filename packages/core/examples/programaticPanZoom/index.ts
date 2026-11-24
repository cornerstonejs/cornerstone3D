import type { PlanarViewport, Types } from '@cornerstonejs/core';
import {
  getRenderingEngine,
  RenderingEngine,
  Enums,
  viewportProjection,
  displaySetRegistry,
} from '@cornerstonejs/core';
import {
  initDemo,
  createImageIdsAndCacheMetaData,
  setTitleAndDescription,
  ctVoiRange,
  addButtonToToolbar,
} from '../../../../utils/demo/helpers';

// This is for debugging purposes
console.warn(
  'Click on index.ts to open source code for this example --------->'
);

const { ViewportType } = Enums;
const renderingEngineId = 'myRenderingEngine';
const viewportId = 'CT_STACK';
const displaySetId = 'programaticPanZoom:ct';

function getRand(min, max) {
  return Math.random() * (max - min) + min;
}
// ======== Set up page ======== //
setTitleAndDescription(
  'Programmatic Pan and Zoom with initial pan and zoom',
  'Displays an image at the top of the viewport, half off the screen, and has pan/zoom buttons.'
);

const content = document.getElementById('content');
const element = document.createElement('div');
element.id = 'cornerstone-element';

element.style.width = '512px';
element.style.height = '512px';

content.appendChild(element);
// ============================= //
addButtonToToolbar({
  title: 'Set Pan (+5,0)',
  onClick: () => {
    // Get the rendering engine
    const renderingEngine = getRenderingEngine(renderingEngineId);

    // Get the stack viewport
    const viewport = renderingEngine.getViewport<PlanarViewport>(viewportId);

    const presentation = viewportProjection.getFraming(viewport, {
      selector: { zoom: true, pan: true },
    });
    const zoom = presentation?.zoom ?? 1;
    const pan = presentation?.pan ?? [0, 0];

    console.log('Current pan', JSON.stringify([pan[0] * zoom, pan[1] * zoom]));

    const panned = viewportProjection.withFraming(viewport, {
      pan: [pan[0] + 5 / zoom, pan[1]],
    });

    if (panned) {
      viewport.setViewState(panned);
    }

    viewport.render();
  },
});

addButtonToToolbar({
  title: 'Set zoom * 1.05 ',
  onClick: () => {
    // Get the rendering engine
    const renderingEngine = getRenderingEngine(renderingEngineId);

    // Get the stack viewport
    const viewport = renderingEngine.getViewport<PlanarViewport>(viewportId);

    const presentation = viewportProjection.getFraming(viewport, {
      selector: { zoom: true, pan: true },
    });
    const zoomed = viewportProjection.withFraming(viewport, {
      zoom: (presentation?.zoom ?? 1) * 1.05,
    });

    if (zoomed) {
      viewport.setViewState(zoomed);
    }

    viewport.render();
  },
});

addButtonToToolbar({
  title: 'Reset Zoom',
  onClick: () => {
    // Get the rendering engine
    const renderingEngine = getRenderingEngine(renderingEngineId);

    // Get the stack viewport
    const viewport = renderingEngine.getViewport<PlanarViewport>(viewportId);

    viewport.resetViewState({
      resetZoom: true,
      resetPan: false,
    });
    viewport.render();
  },
});

addButtonToToolbar({
  title: 'Reset Original',
  onClick: () => {
    // Get the rendering engine
    const renderingEngine = getRenderingEngine(renderingEngineId);

    // Get the stack viewport
    const viewport = renderingEngine.getViewport<PlanarViewport>(viewportId);
    viewport.resetViewState();
    viewport.render();
  },
});

addButtonToToolbar({
  title: 'Set LEFT Display Area',
  onClick: () => {
    // Get the rendering engine
    const renderingEngine = getRenderingEngine(renderingEngineId);

    // Get the stack viewport
    const viewport = renderingEngine.getViewport<PlanarViewport>(viewportId);
    viewport.setViewState({
      displayArea: {
        imageArea: [1.1, 1.1],
        imageCanvasPoint: {
          imagePoint: [0, 0.5],
          canvasPoint: [0, 0.5],
        },
      },
    });
    viewport.render();
  },
});

addButtonToToolbar({
  title: 'Set RIGHT Display Area',
  onClick: () => {
    // Get the rendering engine
    const renderingEngine = getRenderingEngine(renderingEngineId);

    // Get the stack viewport
    const viewport = renderingEngine.getViewport<PlanarViewport>(viewportId);
    viewport.setViewState({
      displayArea: {
        imageArea: [1.1, 1.1],
        imageCanvasPoint: {
          imagePoint: [1, 0.5],
          canvasPoint: [1, 0.5],
        },
      },
    });
    viewport.render();
  },
});

addButtonToToolbar({
  title: 'Set TOP Display Area',
  onClick: () => {
    // Get the rendering engine
    const renderingEngine = getRenderingEngine(renderingEngineId);

    // Get the stack viewport
    const viewport = renderingEngine.getViewport<PlanarViewport>(viewportId);
    viewport.setViewState({
      displayArea: {
        imageArea: [1.1, 1.1],
        imageCanvasPoint: {
          imagePoint: [0.5, 0],
          canvasPoint: [0.5, 0],
        },
      },
    });
    viewport.render();
  },
});

addButtonToToolbar({
  title: 'Set BOTTOM Display Area',
  onClick: () => {
    // Get the rendering engine
    const renderingEngine = getRenderingEngine(renderingEngineId);

    // Get the stack viewport
    const viewport = renderingEngine.getViewport<PlanarViewport>(viewportId);
    viewport.setViewState({
      displayArea: {
        imageArea: [1.1, 1.1],
        imageCanvasPoint: {
          imagePoint: [0.5, 1],
          canvasPoint: [0.5, 1],
        },
      },
    });
    viewport.render();
  },
});

addButtonToToolbar({
  title: 'Set Random Display Area',
  onClick: () => {
    // Get the rendering engine
    const renderingEngine = getRenderingEngine(renderingEngineId);

    // Get the stack viewport
    const viewport = renderingEngine.getViewport<PlanarViewport>(viewportId);
    viewport.setViewState({
      displayArea: {
        imageArea: [getRand(0.5, 1.5), getRand(0.5, 1.5)],
        imageCanvasPoint: {
          imagePoint: [getRand(0.5, 1.5), getRand(0.5, 1.5)],
          canvasPoint: [getRand(0.5, 1.5), getRand(0.5, 1.5)],
        },
      },
    });
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

  // Define a stack containing a single image
  const stack = [imageIds[0]];

  // Set the stack on the viewport
  displaySetRegistry.add(displaySetId, {
    imageIds: stack,
    initialImageIdIndex: 0,
  });

  await viewport.setDisplaySets({ displaySetId });

  // Set the VOI of the stack
  viewport.setDisplaySetAppearance(displaySetId, { voiRange: ctVoiRange });

  // Render the image
  viewport.render();
}

run();
