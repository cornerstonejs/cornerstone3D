import type { Types } from '@cornerstonejs/core';
import {
  RenderingEngine,
  Enums,
  imageLoader,
  metaData,
  getRenderingEngine,
} from '@cornerstonejs/core';
import {
  initDemo,
  setTitleAndDescription,
  addSliderToToolbar,
} from '../../../../utils/demo/helpers';
import createCustomImageLoader from './customImageLoader';
import createImageDropArea from './imageDropArea';
import createLogArea from './logArea';

// This is for debugging purposes
console.warn(
  'Click on index.ts to open source code for this example --------->'
);

const { ViewportType } = Enums;

// ======== Set up page ======== //
setTitleAndDescription(
  'Custom DICOM Image Loaders',
  'Demonstrates how to write a custom Image Loader for DICOMs'
);

const content = document.getElementById('content');

const { area: logArea, addLog } = createLogArea();

const {
  area: imageDropArea,
  setEmit,
  getInstanceBytes,
} = createImageDropArea(addLog);

const element = document.createElement('div');
element.id = 'cornerstone-element';
element.style.width = '500px';
element.style.height = '500px';

content!.appendChild(logArea);
content!.appendChild(imageDropArea);
content!.appendChild(element);

const renderingEngineId = 'myRenderingEngine';
const viewportId = 'STACK';

const { imageLoadFunction, metadataProvider } = createCustomImageLoader(
  addLog,
  getInstanceBytes
);

imageLoader.registerImageLoader(
  'custom',
  imageLoadFunction as unknown as Types.ImageLoaderFn
);

// ============================= //

addSliderToToolbar({
  title: 'Slice Index',
  range: [0, 9],
  defaultValue: 0,
  onSelectedValueChange: (value) => {
    const valueAsNumber = Number(value);

    // Get the rendering engine
    const renderingEngine = getRenderingEngine(renderingEngineId);

    // Get the volume viewport
    const viewport = renderingEngine.getViewport(
      viewportId
    ) as Types.IStackViewport;

    if (valueAsNumber < viewport.getImageIds().length) {
      viewport.setImageIdIndex(valueAsNumber);
    }
    viewport.render();
  },
});

/**
 * Runs the demo
 */
async function run() {
  // Init Cornerstone and related libraries
  await initDemo();

  metaData.addProvider(metadataProvider, 10000);

  // Instantiate a rendering engine
  const renderingEngine = new RenderingEngine(renderingEngineId);

  const viewportInputArray: Types.PublicViewportInput[] = [
    {
      viewportId,
      type: ViewportType.STACK,
      element: element,
    },
  ];
  renderingEngine.setViewports(viewportInputArray);

  // render stack viewport
  setEmit((sopInstanceUids) => {
    const imageIds = sopInstanceUids.map((uid) => `custom:${uid}`);
    renderingEngine.getStackViewports()[0].setStack(imageIds);
  });

  // render volume viewports
  renderingEngine.render();
}

run();
