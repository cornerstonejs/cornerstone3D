import {
  RenderingEngine,
  Types,
  Enums,
  utilities,
  setUseCPURendering,
} from '@cornerstonejs/core';
import {
  initDemo,
  createImageIdsAndCacheMetaData,
  setTitleAndDescription,
  addToggleButtonToToolbar,
  addButtonToToolbar,
} from '../../../../utils/demo/helpers';

// This is for debugging purposes
console.warn(
  'Click on index.ts to open source code for this example --------->'
);

const { ViewportType } = Enums;

// ======== Set up page ======== //
setTitleAndDescription(
  'Render to Canvas',
  'This example uses both viewportAPI and also simple renderToCanvas to render an image. The left viewport is using the viewportAPI and the right viewport is using renderToCanvas.'
);

const size = '500px';
const content = document.getElementById('content');
const viewportGrid = document.createElement('div');

viewportGrid.style.display = 'flex';
viewportGrid.style.flexDirection = 'row';

const element1 = document.createElement('div');
element1.style.width = size;
element1.style.height = size;

const canvas = document.createElement('canvas');

canvas.width = 500;
canvas.height = 500;

viewportGrid.appendChild(element1);
viewportGrid.appendChild(canvas);

content.appendChild(viewportGrid);

// ============================= //
let load;
let useCPURendering = false;

addToggleButtonToToolbar({
  id: 'cpuRendering',
  title: 'CPU Rendering',
  defaultToggle: false,
  onClick: (toggle) => {
    if (toggle) {
      setUseCPURendering(true);
      useCPURendering = true;
    } else {
      setUseCPURendering(false);
      useCPURendering = false;
    }
  },
});

addButtonToToolbar({
  id: 'load',
  title: 'Load',
  onClick: () => {
    load();
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
  const renderingEngineId = 'myRenderingEngine';
  const renderingEngine = new RenderingEngine(renderingEngineId);

  const viewportIds = ['CT_AXIAL_STACK_1'];

  // Create a stack viewport
  const viewportInputArray = [
    {
      viewportId: viewportIds[0],
      type: ViewportType.STACK,
      element: element1,
      defaultOptions: {
        background: <Types.Point3>[0.2, 0, 0.2],
      },
    },
  ];

  load = async () => {
    renderingEngine.setViewports(viewportInputArray);

    // Get the stack viewport that was created
    const viewport1 = <Types.IStackViewport>(
      renderingEngine.getViewport(viewportIds[0])
    );

    const imageId = imageIds[100];

    utilities.loadImageToCanvas({ canvas, imageId, useCPURendering });

    // To simulate a delay in loading the image since the loading
    // mechanisms are different for the two viewports
    setTimeout(() => {
      viewport1.setStack([imageId]);
      renderingEngine.renderViewports(viewportIds);
    }, 200);
  };
}

run();
