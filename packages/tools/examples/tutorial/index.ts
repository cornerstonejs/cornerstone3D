import {
  RenderingEngine,
  Types,
  Enums,
  setVolumesForViewports,
  volumeLoader,
} from '@cornerstonejs/core';
import {
  addTool,
  BrushTool,
  BidirectionalTool,
  ToolGroupManager,
  WindowLevelTool,
  ZoomTool,
  segmentation,
  Enums as csToolsEnums,
} from '@cornerstonejs/tools';
import {
  initDemo,
  createImageIdsAndCacheMetaData,
  setTitleAndDescription,
} from '../../../../utils/demo/helpers';

// This is for debugging purposes
console.warn(
  'Click on index.ts to open source code for this example --------->'
);

// ============================= //
// ======== Set up page ======== //
setTitleAndDescription(
  'Tutorial Playground',
  'The playground for you to copy paste the codes in the tutorials and run it'
);

const { ViewportType } = Enums;

const content = document.getElementById('content');
const element = document.createElement('div');

element.style.width = '500px';
element.style.height = '500px';

content.appendChild(element);

const renderingEngineId = 'myRenderingEngine';

async function run() {
  // Init Cornerstone and related libraries
  await initDemo();
  const renderingEngine = new RenderingEngine(renderingEngineId);
  const viewportId = 'CT_AXIAL_STACK';

  const viewportInput = {
    viewportId,
    element,
    type: ViewportType.STACK,
  };

  renderingEngine.enableElement(viewportInput);

  const imageIds = await createImageIdsAndCacheMetaData({
    StudyInstanceUID:
      '1.3.6.1.4.1.14519.5.2.1.7009.2403.334240657131972136850343327463',
    SeriesInstanceUID:
      '1.3.6.1.4.1.14519.5.2.1.7009.2403.226151125820845824875394858561',
    wadoRsRoot: 'https://d14fa38qiwhyfd.cloudfront.net/dicomweb',
  });

  const viewport = renderingEngine.getViewport(viewportId);

  viewport.setStack(imageIds, 60);

  viewport.render();
}

run();
