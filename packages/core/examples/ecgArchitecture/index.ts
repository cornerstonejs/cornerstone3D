import { RenderingEngine, Enums, utilities } from '@cornerstonejs/core';
import type { ECGViewportV2 } from '@cornerstonejs/core';
import * as cornerstoneTools from '@cornerstonejs/tools';
import {
  createImageIdsAndCacheMetaData,
  getLocalUrl,
  initDemo,
  setTitleAndDescription,
} from '../../../../utils/demo/helpers';

console.warn(
  'Click on index.ts to open source code for this example --------->'
);

const { ViewportType } = Enums;
const { ToolGroupManager } = cornerstoneTools;

const renderingEngineId = 'ecgRenderingEngine';
const viewportId = 'ecgViewportV2';
const toolGroupId = 'ecgToolGroup';

const StudyInstanceUID = '1.3.76.13.65829.2.20130125082826.1072139.2';
const SeriesInstanceUID = '1.3.6.1.4.1.20029.40.20130125105919.5407.1';
const wadoRsRoot =
  getLocalUrl() || 'https://d14fa38qiwhyfd.cloudfront.net/dicomweb';

setTitleAndDescription(
  'ECG Viewport Architecture POC',
  'Right-drag to pan, scroll to zoom.'
);

const content = document.getElementById('content');

if (!content) {
  throw new Error('Missing #content container');
}

const element = document.createElement('div');
element.id = 'ecg-element';
element.style.width = '960px';
element.style.height = '640px';
element.style.background = '#000';
content.appendChild(element);

element.oncontextmenu = (e) => e.preventDefault();

async function run() {
  await initDemo();

  const imageIds = await createImageIdsAndCacheMetaData({
    StudyInstanceUID,
    SeriesInstanceUID,
    wadoRsRoot,
  });

  const { PanTool, ZoomTool } = cornerstoneTools;
  const { MouseBindings } = cornerstoneTools.Enums;

  cornerstoneTools.addTool(PanTool);
  cornerstoneTools.addTool(ZoomTool);

  const toolGroup = ToolGroupManager.createToolGroup(toolGroupId);
  toolGroup.addTool(PanTool.toolName);
  toolGroup.addTool(ZoomTool.toolName);

  toolGroup.setToolActive(PanTool.toolName, {
    bindings: [{ mouseButton: MouseBindings.Secondary }],
  });
  toolGroup.setToolActive(ZoomTool.toolName, {
    bindings: [{ mouseButton: MouseBindings.Wheel }],
  });

  const renderingEngine = new RenderingEngine(renderingEngineId);

  renderingEngine.enableElement({
    viewportId,
    type: ViewportType.ECG_V2,
    element,
  });

  toolGroup.addViewport(viewportId, renderingEngineId);

  const viewport = renderingEngine.getViewport(
    viewportId
  ) as unknown as ECGViewportV2;

  (window as any).viewport = viewport;

  utilities.viewportV2DataSetMetadataProvider.add('ecg-demo', imageIds[0]);
  await viewport.setDataIds(['ecg-demo']);
}

run();
