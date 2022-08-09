import {
  RenderingEngine,
  Enums,
  imageLoader,
  metaData,
  getRenderingEngine,
  Types,
} from '@cornerstonejs/core';
import {
  initDemo,
  setTitleAndDescription,
  addSliderToToolbar,
} from '../../../../utils/demo/helpers';
import hardcodedMetaDataProvider from './hardcodedMetaDataProvider';
import registerWebImageLoader from './registerWebImageLoader';

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
const element = document.createElement('div');
element.id = 'cornerstone-element';
element.style.width = '500px';
element.style.height = '500px';

content.appendChild(element);

const renderingEngineId = 'myRenderingEngine';
const viewportId = 'COLOR_STACK';

const imageIds = [
  'web:https://data.lhncbc.nlm.nih.gov/public/Visible-Human/Male-Images/PNG_format/abdomen/a_vm1455.png',
  'web:https://data.lhncbc.nlm.nih.gov/public/Visible-Human/Male-Images/PNG_format/abdomen/a_vm1456.png',
  'web:https://data.lhncbc.nlm.nih.gov/public/Visible-Human/Male-Images/PNG_format/abdomen/a_vm1457.png',
  'web:https://data.lhncbc.nlm.nih.gov/public/Visible-Human/Male-Images/PNG_format/abdomen/a_vm1458.png',
  'web:https://data.lhncbc.nlm.nih.gov/public/Visible-Human/Male-Images/PNG_format/abdomen/a_vm1459.png',
  'web:https://data.lhncbc.nlm.nih.gov/public/Visible-Human/Male-Images/PNG_format/abdomen/a_vm1460.png',
  'web:https://data.lhncbc.nlm.nih.gov/public/Visible-Human/Male-Images/PNG_format/abdomen/a_vm1461.png',
  'web:https://data.lhncbc.nlm.nih.gov/public/Visible-Human/Male-Images/PNG_format/abdomen/a_vm1462.png',
  'web:https://data.lhncbc.nlm.nih.gov/public/Visible-Human/Male-Images/PNG_format/abdomen/a_vm1463.png',
  'web:https://data.lhncbc.nlm.nih.gov/public/Visible-Human/Male-Images/PNG_format/abdomen/a_vm1464.png',
];

registerWebImageLoader(imageLoader);

metaData.addProvider(
  // @ts-ignore
  (type, imageId) => hardcodedMetaDataProvider(type, imageId, imageIds),
  10000
);
// ============================= //

addSliderToToolbar({
  title: 'SLice Index',
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

  // Instantiate a rendering engine
  const renderingEngine = new RenderingEngine(renderingEngineId);

  const viewportInputArray = [
    {
      viewportId: 'COLOR_STACK',
      type: ViewportType.STACK,
      element,
    },
  ];

  renderingEngine.setViewports(viewportInputArray);

  // render stack viewport
  renderingEngine.getStackViewports()[0].setStack(imageIds);
}

run();
