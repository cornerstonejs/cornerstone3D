import type { Types } from '@cornerstonejs/core';
import {
  RenderingEngine,
  Enums,
  setUseCPURendering,
  getShouldUseCPURendering,
  cache,
  resetInitialization,
  getRenderingEngines,
} from '@cornerstonejs/core';
import {
  initDemo,
  createImageIdsAndCacheMetaData,
  setTitleAndDescription,
  addDropdownToToolbar,
} from '../../../../utils/demo/helpers';
import * as cornerstoneTools from '@cornerstonejs/tools';

console.warn(
  'Click on index.ts to open source code for this example --------->'
);

const {
  PanTool,
  ZoomTool,
  EllipticalROITool,
  ToolGroupManager,
  Enums: csToolsEnums,
} = cornerstoneTools;

const { ViewportType } = Enums;
const { MouseBindings } = csToolsEnums;

const toolGroupId = 'STACK_TOOL_GROUP_ID';

// ======== Set up page ======== //
setTitleAndDescription(
  'Basic Stack Manipulation with CPU/GPU Toggle',
  'Stack viewport with option to switch between CPU and GPU rendering'
);

const content = document.getElementById('content');
const element = document.createElement('div');

element.oncontextmenu = (e) => e.preventDefault();

element.id = 'cornerstone-element';
element.style.width = '500px';
element.style.height = '500px';

content.appendChild(element);

const instructions = document.createElement('p');
instructions.innerText =
  'Left Click: Window/Level\nMiddle Click: Pan\nRight Click: Zoom\nMouse Wheel: Stack Scroll';

content.append(instructions);

cornerstoneTools.addTool(PanTool);
cornerstoneTools.addTool(EllipticalROITool);
cornerstoneTools.addTool(ZoomTool);

const toolGroup = ToolGroupManager.createToolGroup(toolGroupId);

toolGroup.addTool(EllipticalROITool.toolName);
toolGroup.addTool(PanTool.toolName);
toolGroup.addTool(ZoomTool.toolName);

toolGroup.setToolActive(EllipticalROITool.toolName, {
  bindings: [{ mouseButton: MouseBindings.Primary }],
});
toolGroup.setToolActive(PanTool.toolName, {
  bindings: [{ mouseButton: MouseBindings.Auxiliary }],
});
toolGroup.setToolActive(ZoomTool.toolName, {
  bindings: [{ mouseButton: MouseBindings.Secondary }],
});

// ============================= //

addDropdownToToolbar({
  options: {
    values: ['GPU Rendering', 'CPU Rendering'],
    defaultValue: 'GPU Rendering',
  },
  onSelectedValueChange: handleRenderingOptionChange,
});

async function handleRenderingOptionChange(selectedValue) {
  const useCPU = selectedValue === 'CPU Rendering';

  if (getShouldUseCPURendering() !== useCPU) {
    setUseCPURendering(useCPU);

    // Destroy and reinitialize
    const renderingEngine = getRenderingEngines()[0];
    resetInitialization();
    renderingEngine.destroy();
    cache.purgeCache();
    await run();
  }
}

/**
 * Runs the demo
 */
async function run() {
  await initDemo({});

  const imageIds = await createImageIdsAndCacheMetaData({
    StudyInstanceUID:
      '1.3.6.1.4.1.14519.5.2.1.7009.2403.334240657131972136850343327463',
    SeriesInstanceUID:
      '1.3.6.1.4.1.14519.5.2.1.7009.2403.226151125820845824875394858561',
    wadoRsRoot: 'https://d14fa38qiwhyfd.cloudfront.net/dicomweb',
  });

  const renderingEngineId = 'myRenderingEngine';
  const renderingEngine = new RenderingEngine(renderingEngineId);

  const viewportId = 'CT_STACK';
  const viewportInput = {
    viewportId,
    type: ViewportType.STACK,
    element,
    defaultOptions: {
      background: <Types.Point3>[0.2, 0, 0.2],
    },
  };

  renderingEngine.enableElement(viewportInput);

  toolGroup.addViewport(viewportId, renderingEngineId);

  const viewport = renderingEngine.getViewport(
    viewportId
  ) as Types.IStackViewport;

  viewport.setStack(imageIds);

  viewport.render();
}

run();
