import {
  Enums,
  RenderingEngine,
  imageLoader,
  setVolumesForViewports,
  volumeLoader,
} from '@cornerstonejs/core';
import * as cornerstoneTools from '@cornerstonejs/tools';
import {
  createImageIdsAndCacheMetaData,
  initDemo,
  addDropdownToToolbar,
  addButtonToToolbar,
  setTitleAndDescription,
  getLocalUrl,
} from '../../../../utils/demo/helpers';
import { ONNXSegmentationController } from '@cornerstonejs/ai';

const { ViewportType, OrientationAxis } = Enums;
const { MouseBindings, KeyboardBindings } = cornerstoneTools.Enums;

setTitleAndDescription(
  'Basic Single-Viewport AI Segmentation',
  'This example demonstrates a simplified setup of a single viewport that can switch between stack and sagittal views. It includes minimal AI segmentation tools (MarkerInclude, MarkerExclude, BoxPrompt) and basic navigation tools (Pan, Zoom, Stack Scroll). Logging is also retained to show decoding and inference times.'
);

// Logging elements and function
const logs = [];
function mlLogger(logName, ...args) {
  console.log(logName, ...args);
  const element = document.getElementById(logName);
  if (!element) {
    return;
  }
  if (logName === 'status') {
    logs.push(args.join(' '));
    if (logs.length > 5) {
      logs.splice(0, 1);
    }
    element.innerText = logs.join('\n');
    return;
  }
  element.innerText = args.join(' ');
}

// Model configuration for segmentation
const models = {
  sam_b: [
    {
      name: 'sam-b-encoder',
      url: 'https://huggingface.co/schmuell/sam-b-fp16/resolve/main/sam_vit_b_01ec64.encoder-fp16.onnx',
      size: 180,
      key: 'encoder',
    },
    {
      name: 'sam-b-decoder',
      url: 'https://huggingface.co/schmuell/sam-b-fp16/resolve/main/sam_vit_b_01ec64.decoder.onnx',
      size: 17,
      key: 'decoder',
    },
  ],
};

const ai = new ONNXSegmentationController({
  models,
  modelName: 'sam_b',
  listeners: [mlLogger],
});
await ai.initModel();

const toolGroupId = 'DEFAULT_TOOLGROUP_ID';
const renderingEngineId = 'myRenderingEngine';
const volumeId = 'volumeId';

let renderingEngine;
let viewport;
let activeViewport;
let currentViewportType = ViewportType.STACK;

// Tools to include: MarkerInclude, MarkerExclude, BoxPrompt, plus pan/zoom/scroll
const MarkerIncludeToolName = ONNXSegmentationController.MarkerInclude;
const MarkerExcludeToolName = ONNXSegmentationController.MarkerExclude;
const BoxPromptToolName = ONNXSegmentationController.BoxPrompt;

// Add the base tools we need
cornerstoneTools.addTool(cornerstoneTools.PanTool);
cornerstoneTools.addTool(cornerstoneTools.ZoomTool);
cornerstoneTools.addTool(cornerstoneTools.StackScrollTool);
cornerstoneTools.addTool(cornerstoneTools.ProbeTool); // Needed as a base for MarkerInclude/Exclude
cornerstoneTools.addTool(cornerstoneTools.RectangleROITool); // Base for BoxPrompt

// Create a tool group and add the needed tools
const toolGroup =
  cornerstoneTools.ToolGroupManager.createToolGroup(toolGroupId);

// MarkerInclude - a probe variant
toolGroup.addToolInstance(
  MarkerIncludeToolName,
  cornerstoneTools.ProbeTool.toolName,
  {
    getTextLines: () => null,
  }
);
toolGroup.setToolActive(MarkerIncludeToolName, {
  bindings: [{ mouseButton: MouseBindings.Primary }],
});

// MarkerExclude - a probe variant with right-click
toolGroup.addToolInstance(
  MarkerExcludeToolName,
  cornerstoneTools.ProbeTool.toolName,
  {
    getTextLines: () => null,
  }
);
toolGroup.setToolActive(MarkerExcludeToolName, {
  bindings: [{ mouseButton: MouseBindings.Secondary }],
});

// BoxPrompt - a rectangle ROI variant with Ctrl+click
toolGroup.addToolInstance(
  BoxPromptToolName,
  cornerstoneTools.RectangleROITool.toolName,
  {
    getTextLines: () => null,
  }
);
toolGroup.setToolActive(BoxPromptToolName, {
  bindings: [
    { mouseButton: MouseBindings.Primary, modifierKey: KeyboardBindings.Ctrl },
  ],
});

// Pan (middle or Ctrl+drag)
toolGroup.setToolActive(cornerstoneTools.PanTool.toolName, {
  bindings: [
    { mouseButton: MouseBindings.Auxiliary },
    { numTouchPoints: 1, modifierKey: KeyboardBindings.Ctrl },
  ],
});

// Zoom (right mouse)
toolGroup.setToolActive(cornerstoneTools.ZoomTool.toolName, {
  bindings: [{ mouseButton: MouseBindings.Secondary }],
});

// Stack Scroll (mouse wheel or Alt+drag)
toolGroup.setToolActive(cornerstoneTools.StackScrollTool.toolName, {
  bindings: [
    { mouseButton: MouseBindings.Primary, modifierKey: KeyboardBindings.Alt },
    { mouseButton: MouseBindings.Wheel },
  ],
});

const content = document.getElementById('content');
const viewportContainer = document.createElement('div');
viewportContainer.style.width = '512px';
viewportContainer.style.height = '512px';
viewportContainer.style.position = 'relative';
content.appendChild(viewportContainer);

// Logging elements on the page
const encoderLatency = document.createElement('div');
encoderLatency.id = 'encoder';
content.appendChild(encoderLatency);

const decoderLatency = document.createElement('div');
decoderLatency.id = 'decoder';
content.appendChild(decoderLatency);

const logDiv = document.createElement('div');
logDiv.id = 'status';
content.appendChild(logDiv);

addButtonToToolbar({
  title: 'Clear',
  onClick: () => {
    ai.clear(activeViewport);
    viewport.render();
  },
});

const viewportId = 'CURRENT_VIEWPORT';

addDropdownToToolbar({
  options: { values: ['stack', 'sagittal'] },
  onSelectedValueChange: async (value) => {
    currentViewportType =
      value === 'stack' ? ViewportType.STACK : ViewportType.ORTHOGRAPHIC;
    await updateViewport();
  },
});

async function updateViewport() {
  await initDemo();

  if (renderingEngine) {
    renderingEngine.destroy();
  }

  renderingEngine = new RenderingEngine(renderingEngineId);

  const viewportInput = {
    viewportId,
    element: viewportContainer,
    type: currentViewportType,
    defaultOptions: {},
  };

  if (currentViewportType === ViewportType.ORTHOGRAPHIC) {
    viewportInput.defaultOptions.orientation = OrientationAxis.SAGITTAL;
  }

  renderingEngine.setViewports([viewportInput]);
  toolGroup.addViewport(viewportId, renderingEngineId);

  const imageIds = await createAndLoadData();
  if (currentViewportType === ViewportType.STACK) {
    viewport = renderingEngine.getViewport(viewportId);
    await viewport.setStack(imageIds);
    viewport.render();
  } else {
    // For sagittal, create volume and set it
    const volume = await volumeLoader.createAndCacheVolume(volumeId, {
      imageIds,
    });
    volume.load();
    await setVolumesForViewports(renderingEngine, [{ volumeId }], [viewportId]);
    viewport = renderingEngine.getViewport(viewportId);
    viewport.render();
  }

  activeViewport = viewport;
  ai.initViewport(viewport);
}

async function createAndLoadData() {
  const imageIdsFull = await createImageIdsAndCacheMetaData({
    StudyInstanceUID:
      '1.3.6.1.4.1.14519.5.2.1.7009.2403.334240657131972136850343327463',
    SeriesInstanceUID:
      '1.3.6.1.4.1.14519.5.2.1.7009.2403.226151125820845824875394858561',
    wadoRsRoot:
      getLocalUrl() || 'https://d3t6nz73ql33tx.cloudfront.net/dicomweb',
  });
  return imageIdsFull.reverse();
}

updateViewport();
