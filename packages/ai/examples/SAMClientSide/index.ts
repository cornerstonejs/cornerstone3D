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
  addSegmentIndexDropdown,
} from '../../../../utils/demo/helpers';
import { ONNXSegmentationController } from '@cornerstonejs/ai';

const { ViewportType, OrientationAxis } = Enums;
const { MouseBindings, SegmentationRepresentations, Events, KeyboardBindings } =
  cornerstoneTools.Enums;
const { segmentation } = cornerstoneTools;

setTitleAndDescription(
  'Basic Single-Viewport AI Segmentation',
  'This example demonstrates a simplified setup of a single viewport that can switch between stack and sagittal views. It includes minimal AI segmentation tools (MarkerInclude, MarkerExclude, BoxPrompt) and basic navigation tools (Pan, Zoom, Stack Scroll). Logging is also retained to show decoding and inference times.  Use ctrl+click to MarkerExclude'
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

const toolGroupId = 'DEFAULT_TOOLGROUP_ID';
const renderingEngineId = 'myRenderingEngine';
const volumeId = 'volumeId';

let renderingEngine;
let viewport;
let activeViewport;
const currentViewportType = ViewportType.STACK;

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

toolGroup.addTool(cornerstoneTools.ZoomTool.toolName);
toolGroup.addTool(cornerstoneTools.StackScrollTool.toolName);
toolGroup.addTool(cornerstoneTools.PanTool.toolName);
// MarkerInclude - a probe variant
toolGroup.addToolInstance(
  MarkerIncludeToolName,
  cornerstoneTools.ProbeTool.toolName,
  {
    getTextLines: () => null,
  }
);
toolGroup.setToolActive(MarkerIncludeToolName, {
  bindings: [
    { mouseButton: MouseBindings.Primary },
    { mouseButton: MouseBindings.Primary, modifierKey: KeyboardBindings.Shift },
  ],
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
  bindings: [
    { mouseButton: MouseBindings.Primary, modifierKey: KeyboardBindings.Ctrl },
  ],
});

cornerstoneTools.annotation.config.style.setToolGroupToolStyles(toolGroupId, {
  [MarkerIncludeToolName]: {
    color: 'rgb(0, 255, 0)', // Green
    colorHighlighted: 'rgb(0, 255, 0)',
    colorSelected: 'rgb(0, 255, 0)',
  },
  [MarkerExcludeToolName]: {
    color: 'rgb(255, 0, 0)', // Red
    colorHighlighted: 'rgb(255, 0, 0)',
    colorSelected: 'rgb(255, 0, 0)',
  },
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
  bindings: [{ mouseButton: MouseBindings.Primary }],
});

// Pan (middle or Ctrl+drag)
toolGroup.setToolActive(cornerstoneTools.PanTool.toolName, {
  bindings: [{ mouseButton: MouseBindings.Auxiliary }],
});

// Zoom (right mouse)
toolGroup.setToolActive(cornerstoneTools.ZoomTool.toolName, {
  bindings: [
    { mouseButton: MouseBindings.Secondary },
    { mouseButton: MouseBindings.Wheel, modifierKey: KeyboardBindings.Ctrl },
  ],
});

// Stack Scroll (mouse wheel or Alt+drag)
toolGroup.setToolActive(cornerstoneTools.StackScrollTool.toolName, {
  bindings: [{ mouseButton: MouseBindings.Wheel }],
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

// disable context menu
viewportContainer.oncontextmenu = () => false;

addButtonToToolbar({
  title: 'Clear',
  onClick: () => {
    ai.clear(activeViewport);
    viewport.render();
  },
});

addButtonToToolbar({
  title: 'Remove Points',
  onClick: () => {
    // Get all prompt annotations and remove them
    ai.removePromptAnnotationsWithCache(activeViewport);
  },
});
const segmentationId = 'segmentationId';

addSegmentIndexDropdown(segmentationId);

const viewportId = 'CURRENT_VIEWPORT';

addDropdownToToolbar({
  options: {
    values: [MarkerIncludeToolName, MarkerExcludeToolName, BoxPromptToolName],
    defaultValue: MarkerIncludeToolName,
  },
  onSelectedValueChange: (nameAsStringOrNumber) => {
    const name = String(nameAsStringOrNumber);

    // Disable all AI tools first
    toolGroup.setToolDisabled(MarkerIncludeToolName);
    toolGroup.setToolDisabled(MarkerExcludeToolName);
    toolGroup.setToolDisabled(BoxPromptToolName);

    // Enable the selected tool
    toolGroup.setToolActive(name, {
      bindings: [{ mouseButton: MouseBindings.Primary }],
    });
  },
});

async function updateViewport() {
  await initDemo();

  if (renderingEngine) {
    // renderingEngine.destroy();
    segmentation.removeAllSegmentationRepresentations();
    segmentation.removeAllSegmentations();
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

  // Add a segmentation that will contains the contour annotations
  const segmentationImages =
    await imageLoader.createAndCacheDerivedLabelmapImages(imageIds);

  const segmentationImageIds = segmentationImages.map((image) => image.imageId);

  segmentation.addSegmentations([
    {
      segmentationId,
      representation: {
        type: SegmentationRepresentations.Labelmap,
        data: {
          imageIds: segmentationImageIds,
        },
      },
    },
  ]);

  const segMap = {
    [viewport.id]: [{ segmentationId }],
  };

  // Create a segmentation representation associated to the toolGroupId
  await segmentation.addLabelmapRepresentationToViewportMap(segMap);

  activeViewport = viewport;
  await ai.initModel();
  ai.initViewport(viewport);

  viewport.element.addEventListener(Events.KEY_DOWN, (evt) => {
    const { key } = evt.detail;
    const { element } = activeViewport;
    if (key === 'Escape') {
      cornerstoneTools.cancelActiveManipulations(element);
      ai.rejectPreview(element);
    } else if (key === 'Enter') {
      ai.acceptPreview(element);
    } else if (key === 'n') {
      ai.interpolateScroll(activeViewport, 1);
    }
  });
}

async function createAndLoadData() {
  const imageIdsFull = await createImageIdsAndCacheMetaData({
    StudyInstanceUID:
      '1.3.6.1.4.1.14519.5.2.1.7009.2403.334240657131972136850343327463',
    SeriesInstanceUID:
      '1.3.6.1.4.1.14519.5.2.1.7009.2403.226151125820845824875394858561',
    wadoRsRoot:
      getLocalUrl() || 'https://d14fa38qiwhyfd.cloudfront.net/dicomweb',
  });
  return imageIdsFull.reverse();
}

updateViewport();
