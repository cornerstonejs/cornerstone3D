import {
  getRenderingEngine,
  RenderingEngine,
  Types,
  Enums,
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

element.style.width = '500px';
element.style.height = '500px';

content.appendChild(element);
// ============================= //
addButtonToToolbar({
  title: 'Set Pan (+5,0)',
  onClick: () => {
    // Get the rendering engine
    const renderingEngine = getRenderingEngine(renderingEngineId);

    // Get the stack viewport
    const viewport = <Types.IVolumeViewport>(
      renderingEngine.getViewport(viewportId)
    );

    const pan = viewport.getPan();
    console.log('Current pan', JSON.stringify(pan));
    viewport.setPan([pan[0] + 5, pan[1]]);
    viewport.render();
  },
});

addButtonToToolbar({
  title: 'Set zoom * 1.05 ',
  onClick: () => {
    // Get the rendering engine
    const renderingEngine = getRenderingEngine(renderingEngineId);

    // Get the stack viewport
    const viewport = <Types.IVolumeViewport>(
      renderingEngine.getViewport(viewportId)
    );

    const zoom = viewport.getZoom();

    viewport.setZoom(zoom * 1.05);
    viewport.render();
  },
});

addButtonToToolbar({
  title: 'Reset Zoom',
  onClick: () => {
    // Get the rendering engine
    const renderingEngine = getRenderingEngine(renderingEngineId);

    // Get the stack viewport
    const viewport = <Types.IVolumeViewport>(
      renderingEngine.getViewport(viewportId)
    );
    viewport.resetCamera(false, true, false);
    viewport.render();
  },
});

addButtonToToolbar({
  title: 'Reset Original',
  onClick: () => {
    // Get the rendering engine
    const renderingEngine = getRenderingEngine(renderingEngineId);

    // Get the stack viewport
    const viewport = <Types.IVolumeViewport>(
      renderingEngine.getViewport(viewportId)
    );
    viewport.resetCamera();
    viewport.render();
  },
});

// This can be used to see how the reset works
// Compare a reset before and after having done this
addButtonToToolbar({
  title: 'Set current offset/size as pan 0,0/zoom 1',
  onClick: () => {
    // Get the rendering engine
    const renderingEngine = getRenderingEngine(renderingEngineId);

    // Get the stack viewport
    const viewport = <Types.IVolumeViewport>(
      renderingEngine.getViewport(viewportId)
    );
    viewport.setZoom(viewport.getZoom(), true);
  },
});

addButtonToToolbar({
  title: 'Set LEFT Display Area',
  onClick: () => {
    // Get the rendering engine
    const renderingEngine = getRenderingEngine(renderingEngineId);

    // Get the stack viewport
    const viewport = <Types.IVolumeViewport>(
      renderingEngine.getViewport(viewportId)
    );
    viewport.setDisplayArea({
      imageArea: [1.1, 1.1],
      imageCanvasPoint: {
        imagePoint: [0, 0.5],
        canvasPoint: [0, 0.5],
      },
      storeAsInitialCamera: true,
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
    const viewport = <Types.IVolumeViewport>(
      renderingEngine.getViewport(viewportId)
    );
    viewport.setDisplayArea({
      imageArea: [1.1, 1.1],
      imageCanvasPoint: {
        imagePoint: [1, 0.5],
        canvasPoint: [1, 0.5],
      },
      storeAsInitialCamera: true,
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
    const viewport = <Types.IVolumeViewport>(
      renderingEngine.getViewport(viewportId)
    );
    viewport.setDisplayArea({
      imageArea: [1.1, 1.1],
      imageCanvasPoint: {
        imagePoint: [0.5, 0],
        canvasPoint: [0.5, 0],
      },
      storeAsInitialCamera: true,
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
    const viewport = <Types.IVolumeViewport>(
      renderingEngine.getViewport(viewportId)
    );
    viewport.setDisplayArea({
      imageArea: [1.1, 1.1],
      imageCanvasPoint: {
        imagePoint: [0.5, 1],
        canvasPoint: [0.5, 1],
      },
      storeAsInitialCamera: true,
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
    const viewport = <Types.IVolumeViewport>(
      renderingEngine.getViewport(viewportId)
    );
    viewport.setDisplayArea({
      imageArea: [getRand(0.5, 1.5), getRand(0.5, 1.5)],
      imageCanvasPoint: {
        imagePoint: [getRand(0.5, 1.5), getRand(0.5, 1.5)],
        canvasPoint: [getRand(0.5, 1.5), getRand(0.5, 1.5)],
      },
      storeAsInitialCamera: false,
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
  const stack = [imageIds[0]];

  // Set the stack on the viewport
  await viewport.setStack(stack);

  // Set the VOI of the stack
  viewport.setProperties({ voiRange: ctVoiRange });

  // Render the image
  viewport.render();
}

run();
