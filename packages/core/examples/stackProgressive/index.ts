import { RenderingEngine, Types, Enums, cache } from '@cornerstonejs/core';
import {
  initDemo,
  createImageIdsAndCacheMetaData,
  setTitleAndDescription,
} from '../../../../utils/demo/helpers';

// This is for debugging purposes
console.warn(
  'Click on index.ts to open source code for this example --------->'
);

const { ViewportType } = Enums;

// ======== Set up page ======== //
setTitleAndDescription(
  'Progressive Stack',
  'Displays a single DICOM image in a Stack viewport after clicking the load button.'
);

const content = document.getElementById('content');
const { cornerstone } = window;

const instructions = document.createElement('p');
instructions.innerText = 'Click on a button to perform the given load type';
content.appendChild(instructions);

const loaders = document.createElement('div');
content.appendChild(loaders);

const timingInfo = document.createElement('div');
timingInfo.innerText = 'Timing Info Here';
content.appendChild(timingInfo);

const devicePixelRatio = window.devicePixelRatio || 1;
const element = document.createElement('div');
element.id = 'cornerstone-element';
element.style.width = `${3036 / devicePixelRatio}px`;
element.style.height = `${3036 / devicePixelRatio}px`;

content.appendChild(element);

// ============================= //

async function showStack(stack: string[], viewport) {
  cache.purgeCache();
  console.time('imageLoad');
  const start = Date.now();
  // Set the stack on the viewport
  await viewport.setStack(stack);

  // Render the image
  viewport.render();
  console.timeEnd('imageLoad');
  const end = Date.now();
  const { transferSyntaxUID } = cornerstone.metaData.get(
    'transferSyntax',
    stack[0]
  );
  timingInfo.innerText = `Took ${
    end - start
  } for first decode using ${transferSyntaxUID}`;
}

/**
 * Runs the demo
 */
async function run() {
  // Init Cornerstone and related libraries
  await initDemo();

  // Get Cornerstone imageIds and fetch metadata into RAM
  const imageIds = await createImageIdsAndCacheMetaData({
    StudyInstanceUID:
      '1.3.6.1.4.1.9590.100.1.2.19841440611855834937505752510708699165',
    SeriesInstanceUID:
      '1.3.6.1.4.1.9590.100.1.2.160160590111755920740089886004263812825',
    wadoRsRoot: 'http://localhost:5000/dicomweb',
  });

  // Instantiate a rendering engine
  const renderingEngineId = 'myRenderingEngine';
  const renderingEngine = new RenderingEngine(renderingEngineId);

  // Create a stack viewport
  const viewportId = 'DX_3K';
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

  const htj2kButton = document.createElement('button');
  htj2kButton.innerText = 'Load HTJ2K';
  htj2kButton.onclick = showStack.bind(null, [imageIds[0]], viewport);
  loaders.appendChild(htj2kButton);

  const jlsButton = document.createElement('button');
  jlsButton.innerText = 'Load JLS';
  jlsButton.onclick = showStack.bind(null, [imageIds[1]], viewport);
  loaders.appendChild(jlsButton);
}

run();
