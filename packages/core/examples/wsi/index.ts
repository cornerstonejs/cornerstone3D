import type { Types } from '@cornerstonejs/core';
import {
  RenderingEngine,
  Enums,
  getRenderingEngine,
} from '@cornerstonejs/core';
import * as cornerstoneTools from '@cornerstonejs/tools';
import dicomImageLoader from '@cornerstonejs/dicom-image-loader';
import { api } from 'dicomweb-client';

import {
  initDemo,
  setTitleAndDescription,
  createImageIdsAndCacheMetaData,
  getLocalUrl,
  addButtonToToolbar,
  addManipulationBindings,
} from '../../../../utils/demo/helpers';

// This is for debugging purposes
console.warn(
  'Click on index.ts to open source code for this example --------->'
);

const { ToolGroupManager } = cornerstoneTools;

const { wadors } = dicomImageLoader;

const { ViewportType } = Enums;

// ======== Constants ======= //
const renderingEngineId = 'myRenderingEngine';
const viewportId = 'videoViewport';

// ======== Set up page ======== //
setTitleAndDescription(
  'WSI - Whole Slide Imaging Viewport',
  'Demonstrates viewing of whole slide imaging data using an external library'
);

addButtonToToolbar({
  title: 'Zoom In',
  onClick: () => {
    // Get the rendering engine
    const renderingEngine = getRenderingEngine(renderingEngineId);

    // Get the stack viewport
    const viewport = renderingEngine.getViewport(viewportId);

    viewport.setZoom(2 * viewport.getZoom());
    viewport.render();
  },
});

addButtonToToolbar({
  title: 'Disable Viewport',
  onClick: () => {
    // Get the rendering engine
    const renderingEngine = getRenderingEngine(renderingEngineId);
    renderingEngine?.disableElement(viewportId);
  },
});

const content = document.getElementById('content');
const element = document.createElement('div');
element.id = 'cornerstone-element';
element.oncontextmenu = () => false;
element.style.width = '500px';
element.style.height = '500px';

content.appendChild(element);

function createToolGroup(toolGroupId = 'default') {
  // Define a tool group, which defines how mouse events map to tool commands for
  // Any viewport using the group
  const toolGroup = ToolGroupManager.createToolGroup(toolGroupId);
  addManipulationBindings(toolGroup);

  return toolGroup;
}
/**
 * Runs the demo
 */
async function run() {
  // Init Cornerstone and related libraries
  await initDemo();

  const toolGroupId = 'default';
  const toolGroup = createToolGroup(toolGroupId);

  // Get Cornerstone imageIds and fetch metadata into RAM
  // TODO - deploy the testdata publically
  const wadoRsRoot =
    getLocalUrl() || 'https://d3t6nz73ql33tx.cloudfront.net/dicomweb';
  const client = new api.DICOMwebClient({ url: wadoRsRoot });
  const imageIds = await createImageIdsAndCacheMetaData({
    StudyInstanceUID: '1.2.276.1.74.1.2.132733202464108492637644434464108492',
    SeriesInstanceUID:
      '2.16.840.1.113883.3.8467.132733202477512857637644434477512857',
    client,
    wadoRsRoot,
    convertMultiframe: false,
  });

  // Instantiate a rendering engine
  const renderingEngine = new RenderingEngine(renderingEngineId);

  // Create a stack viewport

  const viewportInput = {
    viewportId,
    type: ViewportType.WHOLE_SLIDE,
    element,
    defaultOptions: {
      background: [0.2, 0, 0.2] as Types.Point3,
    },
  };

  renderingEngine.enableElement(viewportInput);

  // Get the stack viewport that was created
  const viewport = renderingEngine.getViewport(
    viewportId
  ) as Types.IWSIViewport;

  client.getDICOMwebMetadata = (imageId) => wadors.metaDataManager.get(imageId);
  // Set the stack on the viewport
  await viewport.setDataIds(imageIds, { webClient: client });

  toolGroup.addViewport(viewportId, renderingEngineId);
}

run();
