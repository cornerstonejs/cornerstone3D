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
  addToggleButtonToToolbar,
  addSliderToToolbar,
  addButtonToToolbar,
  setTitleAndDescription,
  getLocalUrl,
  addSegmentIndexDropdown,
} from '../../../../utils/demo/helpers';
import { ONNXSegmentationController } from '@cornerstonejs/ai';
const { MouseBindings, SegmentationRepresentations, Events, KeyboardBindings } =
  cornerstoneTools.Enums;
const { ViewportType, OrientationAxis } = Enums;

const { segmentation } = cornerstoneTools;
const { segmentation: segmentationUtils } = cornerstoneTools.utilities;
const currentViewportType = ViewportType.STACK;

setTitleAndDescription(
  'Segment Assistant',
  'Segment Assistant for Segmentation'
);

// Model configuration for segmentation
const segmentAI = new ONNXSegmentationController({
  autoSegmentMode: true,
  models: {
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
  },
  modelName: 'sam_b',
});

addSliderToToolbar({
  title: 'Brush Size',
  range: [5, 50],
  defaultValue: 25,
  onSelectedValueChange: (valueAsStringOrNumber) => {
    const value = Number(valueAsStringOrNumber);
    segmentationUtils.setBrushSizeForToolGroup(toolGroupId, value);
  },
});

addToggleButtonToToolbar({
  title: 'Toggle Enable',
  onClick: () => {
    // Toggle the enable state
    segmentAI.enabled = !segmentAI.enabled;
    segmentAI.initViewport(viewport);
  },
});

const toolGroupId = 'DEFAULT_TOOLGROUP_ID';
const renderingEngineId = 'myRenderingEngine';
const volumeId = 'volumeId';

let renderingEngine;
let viewport;
let activeViewport;

// Add the base tools we need
cornerstoneTools.addTool(cornerstoneTools.PanTool);
cornerstoneTools.addTool(cornerstoneTools.ZoomTool);
cornerstoneTools.addTool(cornerstoneTools.StackScrollTool);
cornerstoneTools.addTool(cornerstoneTools.ProbeTool); // Needed as a base for MarkerInclude/Exclude
cornerstoneTools.addTool(cornerstoneTools.RectangleROITool); // Base for BoxPrompt
cornerstoneTools.addTool(cornerstoneTools.BrushTool); // Base for BoxPrompt
// Create a tool group and add the needed tools
const toolGroup =
  cornerstoneTools.ToolGroupManager.createToolGroup(toolGroupId);

toolGroup.addTool(cornerstoneTools.ZoomTool.toolName);
toolGroup.addTool(cornerstoneTools.StackScrollTool.toolName);
toolGroup.addTool(cornerstoneTools.PanTool.toolName);
toolGroup.addTool(cornerstoneTools.ProbeTool.toolName);
toolGroup.addToolInstance(
  'CircularBrush',
  cornerstoneTools.BrushTool.toolName,
  {
    activeStrategy: 'FILL_INSIDE_CIRCLE',
    preview: {
      enabled: true,
    },
    useCenterSegmentIndex: true,
  }
);

// Pan (middle or Ctrl+drag)
toolGroup.setToolActive(cornerstoneTools.PanTool.toolName, {
  bindings: [{ mouseButton: MouseBindings.Auxiliary }],
});
toolGroup.setToolPassive(cornerstoneTools.ProbeTool.toolName, {});

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
toolGroup.setToolActive('CircularBrush', {
  bindings: [{ mouseButton: MouseBindings.Primary }],
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

segmentationUtils.setBrushSizeForToolGroup(toolGroupId, 15);

addButtonToToolbar({
  title: 'Clear',
  onClick: () => {
    segmentAI.clear(activeViewport);
    viewport.render();
  },
});

const viewportId = 'CURRENT_VIEWPORT';
const segmentationId = 'segmentationId';

addSegmentIndexDropdown(segmentationId);

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
    await viewport.setStack(imageIds.reverse().slice(50, 190));

    cornerstoneTools.utilities.stackContextPrefetch.enable(viewportContainer);
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
  await segmentAI.initModel();

  viewport.element.addEventListener(Events.KEY_DOWN, (evt) => {
    const { key } = evt.detail;
    const { element } = activeViewport;
    if (key === 'Escape') {
      cornerstoneTools.cancelActiveManipulations(element);
      segmentAI.rejectPreview(element);
    } else if (key === 'Enter') {
      segmentAI.acceptPreview(element);
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
