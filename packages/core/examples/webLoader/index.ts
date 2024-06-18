import {
  RenderingEngine,
  Enums,
  imageLoader,
  metaData,
  getRenderingEngine,
  Types,
  setVolumesForViewports,
  volumeLoader,
} from '@cornerstonejs/core';
import {
  initDemo,
  setTitleAndDescription,
  addSliderToToolbar,
} from '../../../../utils/demo/helpers/index.js';
import hardcodedMetaDataProvider from './hardcodedMetaDataProvider.js';
import registerWebImageLoader from './registerWebImageLoader.js';

// This is for debugging purposes
console.warn(
  'Click on index.ts to open source code for this example --------->'
);

const { ViewportType } = Enums;

// ======== Set up page ======== //
setTitleAndDescription(
  'Web Color Images',
  'Demonstrates how to render a web color image in JPG or PNG format in a StackViewport'
);

const content = document.getElementById('content');

const element1 = document.createElement('div');
element1.id = 'cornerstone-element1';
element1.style.width = '500px';
element1.style.height = '500px';

const paraElement = document.createElement('p');
const paraText = document.createTextNode('volume viewport');
paraElement.appendChild(paraText);

const rowElement = document.createElement('div');
rowElement.style.display = 'flex';
rowElement.style.justifyContent = 'space-between';

const element2 = document.createElement('div');
element2.id = 'cornerstone-element2';
element2.style.width = '500px';
element2.style.height = '500px';

const element3 = document.createElement('div');
element3.id = 'cornerstone-element3';
element3.style.width = '500px';
element3.style.height = '500px';

const element4 = document.createElement('div');
element4.id = 'cornerstone-element4';
element4.style.width = '500px';
element4.style.height = '500px';

rowElement.appendChild(element2);
rowElement.appendChild(element3);
rowElement.appendChild(element4);

content.appendChild(element1);
content.appendChild(paraElement);
content.appendChild(rowElement);

const renderingEngineId = 'myRenderingEngine';
const viewportId = 'COLOR_STACK';

// png images hosted on web (s3 with cors enabled) from the visible human project
// https://www.nlm.nih.gov/research/visible/visible_human.html
const imageIds = [
  'web:https://cs3d-jpg-example.s3.us-east-2.amazonaws.com/a_vm1460.png',
  'web:https://cs3d-jpg-example.s3.us-east-2.amazonaws.com/a_vm1461.png',
  'web:https://cs3d-jpg-example.s3.us-east-2.amazonaws.com/a_vm1462.png',
  'web:https://cs3d-jpg-example.s3.us-east-2.amazonaws.com/a_vm1463.png',
  'web:https://cs3d-jpg-example.s3.us-east-2.amazonaws.com/a_vm1464.png',
  'web:https://cs3d-jpg-example.s3.us-east-2.amazonaws.com/a_vm1465.png',
  'web:https://cs3d-jpg-example.s3.us-east-2.amazonaws.com/a_vm1466.png',
  'web:https://cs3d-jpg-example.s3.us-east-2.amazonaws.com/a_vm1467.png',
  'web:https://cs3d-jpg-example.s3.us-east-2.amazonaws.com/a_vm1468.png',
  'web:https://cs3d-jpg-example.s3.us-east-2.amazonaws.com/a_vm1469.png',
  'web:https://cs3d-jpg-example.s3.us-east-2.amazonaws.com/a_vm1470.png',
  'web:https://cs3d-jpg-example.s3.us-east-2.amazonaws.com/a_vm1471.png',
  'web:https://cs3d-jpg-example.s3.us-east-2.amazonaws.com/a_vm1472.png',
];

registerWebImageLoader(imageLoader);

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
    const viewport = <Types.IStackViewport>(
      renderingEngine.getViewport(viewportId)
    );

    viewport.setImageIdIndex(valueAsNumber);
    viewport.render();
  },
});
/**
 * Runs the demo
 */
async function run() {
  // Init Cornerstone and related libraries
  await initDemo();

  metaData.addProvider(
    // @ts-ignore
    (type, imageId) => hardcodedMetaDataProvider(type, imageId, imageIds),
    10000
  );

  // Instantiate a rendering engine
  const renderingEngine = new RenderingEngine(renderingEngineId);

  const viewportInputArray = [
    {
      viewportId: 'COLOR_STACK',
      type: ViewportType.STACK,
      element: element1,
    },
    {
      viewportId: 'COLOR_VOLUME_1',
      type: ViewportType.ORTHOGRAPHIC,
      element: element2,
    },
    {
      viewportId: 'COLOR_VOLUME_2',
      type: ViewportType.ORTHOGRAPHIC,
      element: element3,
      defaultOptions: {
        orientation: Enums.OrientationAxis.CORONAL,
      },
    },
    {
      viewportId: 'COLOR_VOLUME_3',
      type: ViewportType.ORTHOGRAPHIC,
      element: element4,
      defaultOptions: {
        orientation: Enums.OrientationAxis.SAGITTAL,
      },
    },
  ];

  const volumeId = 'COLOR_VOLUME';

  const volume = await volumeLoader.createAndCacheVolume(volumeId, {
    imageIds,
  });

  renderingEngine.setViewports(viewportInputArray);

  // render stack viewport
  renderingEngine.getStackViewports()[0].setStack(imageIds);

  setVolumesForViewports(
    renderingEngine,
    [{ volumeId }],
    ['COLOR_VOLUME_1', 'COLOR_VOLUME_2', 'COLOR_VOLUME_3']
  );

  volume.load();

  // render volume viewports
  renderingEngine.render();
}

run();
