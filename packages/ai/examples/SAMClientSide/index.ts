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
import {
  ONNXSegmentationController,
  DEFAULT_SAM_MODEL_NAME,
  getSamModelOptions,
  modelsFromPresets,
} from '@cornerstonejs/ai';

const { ViewportType, OrientationAxis } = Enums;
const { MouseBindings, SegmentationRepresentations, Events, KeyboardBindings } =
  cornerstoneTools.Enums;
const { segmentation } = cornerstoneTools;

setTitleAndDescription(
  'Basic Single-Viewport AI Segmentation',
  'Select a SAM model, click Download & load, then segment the CT stack with MarkerInclude, MarkerExclude, or BoxPrompt. Use ctrl+click for MarkerExclude.'
);

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

const presetNames = ['mobile_sam', 'sam_b', 'sam_b_quant'];
const models = modelsFromPresets(presetNames);
const samModelOptions = getSamModelOptions().filter((option) =>
  presetNames.includes(option.value)
);

let ai;
let selectedModelName = DEFAULT_SAM_MODEL_NAME;
let demoLoaded = false;
let isLoadingModel = false;

const toolGroupId = 'DEFAULT_TOOLGROUP_ID';
const renderingEngineId = 'myRenderingEngine';
const volumeId = 'volumeId';

let renderingEngine;
let viewport;
let activeViewport;
const currentViewportType = ViewportType.STACK;

const MarkerIncludeToolName = ONNXSegmentationController.MarkerInclude;
const MarkerExcludeToolName = ONNXSegmentationController.MarkerExclude;
const BoxPromptToolName = ONNXSegmentationController.BoxPrompt;

cornerstoneTools.addTool(cornerstoneTools.PanTool);
cornerstoneTools.addTool(cornerstoneTools.ZoomTool);
cornerstoneTools.addTool(cornerstoneTools.StackScrollTool);
cornerstoneTools.addTool(cornerstoneTools.ProbeTool);
cornerstoneTools.addTool(cornerstoneTools.RectangleROITool);

const toolGroup =
  cornerstoneTools.ToolGroupManager.createToolGroup(toolGroupId);

toolGroup.addTool(cornerstoneTools.ZoomTool.toolName);
toolGroup.addTool(cornerstoneTools.StackScrollTool.toolName);
toolGroup.addTool(cornerstoneTools.PanTool.toolName);
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
    color: 'rgb(0, 255, 0)',
    colorHighlighted: 'rgb(0, 255, 0)',
    colorSelected: 'rgb(0, 255, 0)',
  },
  [MarkerExcludeToolName]: {
    color: 'rgb(255, 0, 0)',
    colorHighlighted: 'rgb(255, 0, 0)',
    colorSelected: 'rgb(255, 0, 0)',
  },
});

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

toolGroup.setToolActive(cornerstoneTools.PanTool.toolName, {
  bindings: [{ mouseButton: MouseBindings.Auxiliary }],
});

toolGroup.setToolActive(cornerstoneTools.ZoomTool.toolName, {
  bindings: [
    { mouseButton: MouseBindings.Secondary },
    { mouseButton: MouseBindings.Wheel, modifierKey: KeyboardBindings.Ctrl },
  ],
});

toolGroup.setToolActive(cornerstoneTools.StackScrollTool.toolName, {
  bindings: [{ mouseButton: MouseBindings.Wheel }],
});

const content = document.getElementById('content');
const viewportContainer = document.createElement('div');
viewportContainer.style.width = '512px';
viewportContainer.style.height = '512px';
viewportContainer.style.position = 'relative';
content.appendChild(viewportContainer);

const placeholder = document.createElement('div');
placeholder.style.position = 'absolute';
placeholder.style.inset = '0';
placeholder.style.display = 'flex';
placeholder.style.alignItems = 'center';
placeholder.style.justifyContent = 'center';
placeholder.style.padding = '1rem';
placeholder.style.textAlign = 'center';
placeholder.style.background = 'rgba(0, 0, 0, 0.85)';
placeholder.style.color = '#fff';
placeholder.style.zIndex = '1';
placeholder.innerText =
  'Select a SAM model above, then click Download & load to fetch the model and show the CT.';
viewportContainer.appendChild(placeholder);

const encoderLatency = document.createElement('div');
encoderLatency.id = 'encoder';
content.appendChild(encoderLatency);

const decoderLatency = document.createElement('div');
decoderLatency.id = 'decoder';
content.appendChild(decoderLatency);

const logDiv = document.createElement('div');
logDiv.id = 'status';
content.appendChild(logDiv);

viewportContainer.oncontextmenu = () => false;

const modelSelectElement = addDropdownToToolbar({
  labelText: 'SAM model',
  options: {
    values: samModelOptions.map((option) => option.value),
    labels: samModelOptions.map((option) => option.label),
    defaultValue: DEFAULT_SAM_MODEL_NAME,
  },
  onSelectedValueChange: (nameAsStringOrNumber) => {
    if (demoLoaded || isLoadingModel) {
      return;
    }
    selectedModelName = String(nameAsStringOrNumber);
  },
});

const loadButtonElement = addButtonToToolbar({
  title: 'Download & load',
  onClick: () => {
    void loadDemoWithModel();
  },
});

addButtonToToolbar({
  title: 'Clear',
  onClick: () => {
    if (!ai || !activeViewport) {
      return;
    }
    ai.clear(activeViewport);
    viewport.render();
  },
});

addButtonToToolbar({
  title: 'Remove Points',
  onClick: () => {
    if (!ai || !activeViewport) {
      return;
    }
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

    toolGroup.setToolDisabled(MarkerIncludeToolName);
    toolGroup.setToolDisabled(MarkerExcludeToolName);
    toolGroup.setToolDisabled(BoxPromptToolName);

    toolGroup.setToolActive(name, {
      bindings: [{ mouseButton: MouseBindings.Primary }],
    });
  },
});

function setLoadUiState(loading: boolean, loaded = demoLoaded) {
  isLoadingModel = loading;
  if (modelSelectElement) {
    modelSelectElement.disabled = loading || loaded;
  }
  if (loadButtonElement) {
    loadButtonElement.disabled = loading || loaded;
    loadButtonElement.innerText = loading
      ? 'Downloading & loading…'
      : loaded
        ? 'Loaded'
        : 'Download & load';
  }
}

async function loadDemoWithModel() {
  if (demoLoaded || isLoadingModel) {
    return;
  }

  setLoadUiState(true);
  mlLogger('status', `Loading ${selectedModelName}…`);

  try {
    ai = new ONNXSegmentationController({
      models,
      modelName: selectedModelName,
      listeners: [mlLogger],
    });
    ai.enabled = true;

    await setupViewport();

    placeholder.remove();
    demoLoaded = true;
    mlLogger('status', `${selectedModelName} ready`);
  } catch (error) {
    console.error(error);
    mlLogger('status', `Failed to load ${selectedModelName}`);
    ai = undefined;
  } finally {
    setLoadUiState(false, demoLoaded);
  }
}

async function setupViewport() {
  if (renderingEngine) {
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
    viewportInput.defaultOptions.orientation = OrientationAxis.AXIAL;
  }

  renderingEngine.setViewports([viewportInput]);
  toolGroup.addViewport(viewportId, renderingEngineId);

  const imageIds = await createAndLoadData();

  if (currentViewportType === ViewportType.STACK) {
    viewport = renderingEngine.getViewport(viewportId);
    await viewport.setStack(imageIds);
    viewport.render();
  } else {
    const volume = await volumeLoader.createAndCacheVolume(volumeId, {
      imageIds,
    });
    volume.load();
    await setVolumesForViewports(renderingEngine, [{ volumeId }], [viewportId]);
    viewport = renderingEngine.getViewport(viewportId);
    viewport.render();
  }

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

void initDemo();
