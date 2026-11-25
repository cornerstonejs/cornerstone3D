import type { PlanarViewport } from '@cornerstonejs/core';
import {
  RenderingEngine,
  Enums,
  getRenderingEngine,
  init as csRenderInit,
  displaySetRegistry,
} from '@cornerstonejs/core';

import { init as initLoader } from '@cornerstonejs/dicom-image-loader';
import {
  addButtonToToolbar,
  setTitleAndDescription,
  ctVoiRange,
} from '../../../../utils/demo/helpers';
import {
  ctImageIds,
  ptImageIds,
} from '../../../../utils/demo/helpers/WADOURICreateImageIds';

// This is for debugging purposes
console.warn(
  'Click on index.ts to open source code for this example --------->'
);

const { ViewportType } = Enums;

// ======== Set up page ======== //
setTitleAndDescription('WADO URI example', 'WADO URI example');

const content = document.getElementById('content');
const element = document.createElement('div');
element.id = 'cornerstone-element';
element.style.width = '512px';
element.style.height = '512px';

content.appendChild(element);
// ============================= //

// Instantiate a rendering engine
const renderingEngineId = 'myRenderingEngine';
const viewportId = 'CT_STACK';
const ctDisplaySetId = 'wadouri:ct';
const ptDisplaySetId = 'wadouri:pt';

addButtonToToolbar({
  title: 'Load CT Image',
  onClick: () => {
    // Get the rendering engine
    const renderingEngine = getRenderingEngine(renderingEngineId);

    // Get the stack viewport
    const viewport = renderingEngine.getViewport<PlanarViewport>(viewportId);

    viewport.setDisplaySets({
      displaySetId: ctDisplaySetId,
      options: { initialImageIdIndex: 0 },
    });
  },
});

addButtonToToolbar({
  title: 'Load PT Image',
  onClick: () => {
    // Get the rendering engine
    const renderingEngine = getRenderingEngine(renderingEngineId);

    // Get the stack viewport
    const viewport = renderingEngine.getViewport<PlanarViewport>(viewportId);

    viewport.setDisplaySets({
      displaySetId: ptDisplaySetId,
      options: { initialImageIdIndex: 0 },
    });
  },
});
/**
 * Runs the demo
 */
async function run() {
  // Init Cornerstone and related libraries

  const urlParams = new URLSearchParams(window.location.search);
  const debugMode = urlParams.get('debug') === 'true';

  await csRenderInit({
    debug: {
      statsOverlay: debugMode,
    },
  });

  await initLoader();

  const renderingEngine = new RenderingEngine(renderingEngineId);

  // Create a stack viewport
  const viewportInput = {
    viewportId,
    type: ViewportType.PLANAR,
    element,
  };

  renderingEngine.enableElement(viewportInput);

  // Get the stack viewport that was created
  const viewport = renderingEngine.getViewport<PlanarViewport>(viewportId);

  displaySetRegistry.add(ctDisplaySetId, {
    imageIds: ctImageIds,
  });
  displaySetRegistry.add(ptDisplaySetId, {
    imageIds: ptImageIds,
  });

  // Set the stack on the viewport
  await viewport.setDisplaySets({
    displaySetId: ctDisplaySetId,
    options: { initialImageIdIndex: 0 },
  });

  // Set the VOI of the stack
  viewport.setDisplaySetAppearance(ctDisplaySetId, { voiRange: ctVoiRange });

  // Render the image
  viewport.render();
}

run();
