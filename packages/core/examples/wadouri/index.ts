import type { Types } from '@cornerstonejs/core';
import {
  RenderingEngine,
  Enums,
  getRenderingEngine,
  init as csRenderInit,
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
element.style.width = '500px';
element.style.height = '500px';

content.appendChild(element);
// ============================= //

// Instantiate a rendering engine
const renderingEngineId = 'myRenderingEngine';
const viewportId = 'CT_STACK';

addButtonToToolbar({
  title: 'Load CT Image',
  onClick: () => {
    // Get the rendering engine
    const renderingEngine = getRenderingEngine(renderingEngineId);

    // Get the stack viewport
    const viewport = renderingEngine.getViewport(
      viewportId
    ) as Types.IStackViewport;

    viewport.setStack(ctImageIds);
  },
});

addButtonToToolbar({
  title: 'Load PT Image',
  onClick: () => {
    // Get the rendering engine
    const renderingEngine = getRenderingEngine(renderingEngineId);

    // Get the stack viewport
    const viewport = renderingEngine.getViewport(
      viewportId
    ) as Types.IStackViewport;

    viewport.setStack(ptImageIds);
  },
});
/**
 * Runs the demo
 */
async function run() {
  // Init Cornerstone and related libraries
  await csRenderInit();
  await initLoader();

  const renderingEngine = new RenderingEngine(renderingEngineId);

  // Create a stack viewport
  const viewportInput = {
    viewportId,
    type: ViewportType.STACK,
    element,
  };

  renderingEngine.enableElement(viewportInput);

  // Get the stack viewport that was created
  const viewport = renderingEngine.getViewport(
    viewportId
  ) as Types.IStackViewport;

  // Define a stack containing a single image
  const stack = ctImageIds;

  // Set the stack on the viewport
  await viewport.setStack(stack);

  // Set the VOI of the stack
  viewport.setProperties({ voiRange: ctVoiRange });

  // Render the image
  viewport.render();
}

run();
