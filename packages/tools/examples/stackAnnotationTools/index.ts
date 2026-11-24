import type { PlanarViewport, Types } from '@cornerstonejs/core';
import {
  RenderingEngine,
  Enums,
  getRenderingEngine,
  viewportProjection,
  displaySetRegistry,
} from '@cornerstonejs/core';
import {
  initDemo,
  createImageIdsAndCacheMetaData,
  setTitleAndDescription,
  addDropdownToToolbar,
  addButtonToToolbar,
} from '../../../../utils/demo/helpers';
import * as cornerstoneTools from '@cornerstonejs/tools';

// This is for debugging purposes
console.warn(
  'Click on index.ts to open source code for this example --------->'
);

const {
  LengthTool,
  HeightTool,
  ProbeTool,
  RectangleROITool,
  EllipticalROITool,
  CircleROITool,
  BidirectionalTool,
  AngleTool,
  CobbAngleTool,
  ToolGroupManager,
  ArrowAnnotateTool,
  PlanarFreehandROITool,
  EraserTool,
  KeyImageTool,
  LabelTool,
  Enums: csToolsEnums,
} = cornerstoneTools;

const { ViewportType, Events } = Enums;
const { MouseBindings } = csToolsEnums;
const renderingEngineId = 'myRenderingEngine';
const viewportId = 'CT_STACK';
const displaySetId = 'stackAnnotationTools:ct';

// ======== Set up page ======== //
setTitleAndDescription(
  'Annotation Tools Stack',
  'Annotation tools for a stack viewport'
);

const content = document.getElementById('content');
const element = document.createElement('div');

// Disable right click context menu so we can have right click tools
element.oncontextmenu = (e) => e.preventDefault();

element.id = 'cornerstone-element';
element.style.width = '512px';
element.style.height = '512px';

content.appendChild(element);

const info = document.createElement('div');
content.appendChild(info);

const instructions = document.createElement('p');
instructions.innerText = 'Left Click to use selected tool';
info.appendChild(instructions);

const rotationInfo = document.createElement('div');
info.appendChild(rotationInfo);

const flipHorizontalInfo = document.createElement('div');
info.appendChild(flipHorizontalInfo);

const flipVerticalInfo = document.createElement('div');
info.appendChild(flipVerticalInfo);

element.addEventListener(Events.CAMERA_MODIFIED, (_) => {
  // Get the rendering engine
  const renderingEngine = getRenderingEngine(renderingEngineId);

  // Get the stack viewport
  const viewport = renderingEngine.getViewport<PlanarViewport>(viewportId);

  if (!viewport) {
    return;
  }

  const { flipHorizontal = false, flipVertical = false } =
    viewport.getViewState();
  const { rotation = 0 } =
    viewportProjection.getPresentation(viewport, {
      selector: { rotation: true },
    }) ?? {};

  rotationInfo.innerText = `Rotation: ${Math.round(rotation)}`;
  flipHorizontalInfo.innerText = `Flip horizontal: ${flipHorizontal}`;
  flipVerticalInfo.innerText = `Flip vertical: ${flipVertical}`;
});
// ============================= //

const toolGroupId = 'STACK_TOOL_GROUP_ID';

const cancelToolDrawing = (evt) => {
  const { element, key } = evt.detail;
  if (key === 'Escape') {
    cornerstoneTools.cancelActiveManipulations(element);
  }
};

element.addEventListener(csToolsEnums.Events.KEY_DOWN, (evt) => {
  cancelToolDrawing(evt);
});

const toolsNames = [
  LengthTool.toolName,
  HeightTool.toolName,
  ProbeTool.toolName,
  RectangleROITool.toolName,
  EllipticalROITool.toolName,
  CircleROITool.toolName,
  BidirectionalTool.toolName,
  AngleTool.toolName,
  CobbAngleTool.toolName,
  ArrowAnnotateTool.toolName,
  PlanarFreehandROITool.toolName,
  EraserTool.toolName,
  KeyImageTool.toolName,
  LabelTool.toolName,
];
let selectedToolName = toolsNames[0];

addDropdownToToolbar({
  options: { values: toolsNames, defaultValue: selectedToolName },
  onSelectedValueChange: (newSelectedToolNameAsStringOrNumber) => {
    const newSelectedToolName = String(newSelectedToolNameAsStringOrNumber);
    const toolGroup = ToolGroupManager.getToolGroup(toolGroupId);

    // Set the new tool active
    toolGroup.setToolActive(newSelectedToolName, {
      bindings: [
        {
          mouseButton: MouseBindings.Primary, // Left Click
        },
      ],
    });

    // Set the old tool passive
    toolGroup.setToolPassive(selectedToolName);

    selectedToolName = <string>newSelectedToolName;
  },
});

addButtonToToolbar({
  title: 'Flip H',
  onClick: () => {
    // Get the rendering engine
    const renderingEngine = getRenderingEngine(renderingEngineId);

    // Get the stack viewport
    const viewport = renderingEngine.getViewport<PlanarViewport>(viewportId);

    const { flipHorizontal = false } = viewport.getViewState();
    viewport.setViewState({ flipHorizontal: !flipHorizontal });

    viewport.render();
  },
});

addButtonToToolbar({
  title: 'Flip V',
  onClick: () => {
    // Get the rendering engine
    const renderingEngine = getRenderingEngine(renderingEngineId);

    // Get the stack viewport
    const viewport = renderingEngine.getViewport<PlanarViewport>(viewportId);

    const { flipVertical = false } = viewport.getViewState();

    viewport.setViewState({ flipVertical: !flipVertical });

    viewport.render();
  },
});

addButtonToToolbar({
  title: 'Rotate Delta 90',
  onClick: () => {
    // Get the rendering engine
    const renderingEngine = getRenderingEngine(renderingEngineId);

    // Get the stack viewport
    const viewport = renderingEngine.getViewport<PlanarViewport>(viewportId);

    const { rotation = 0 } =
      viewportProjection.getPresentation(viewport, {
        selector: { rotation: true },
      }) ?? {};
    const viewState = viewportProjection.withPresentation(viewport, {
      rotation: rotation + 90,
    });

    if (viewState) {
      viewport.setViewState(viewState);
    }

    viewport.render();
  },
});

/**
 * Runs the demo
 */
async function run() {
  // Init Cornerstone and related libraries
  const config = (window as any).IS_TILED
    ? { core: { renderingEngineMode: 'tiled' } }
    : {};
  await initDemo(config);

  const defaultToolStyles =
    cornerstoneTools.annotation.config.style.getDefaultToolStyles();

  defaultToolStyles.global.showHandlesAlways = true;
  defaultToolStyles.global.showGrabCursor = true;

  cornerstoneTools.annotation.config.style.setDefaultToolStyles(
    defaultToolStyles
  );

  // Add tools to Cornerstone3D
  cornerstoneTools.addTool(LengthTool);
  cornerstoneTools.addTool(HeightTool);
  cornerstoneTools.addTool(ProbeTool);
  cornerstoneTools.addTool(RectangleROITool);
  cornerstoneTools.addTool(EllipticalROITool);
  cornerstoneTools.addTool(CircleROITool);
  cornerstoneTools.addTool(BidirectionalTool);
  cornerstoneTools.addTool(AngleTool);
  cornerstoneTools.addTool(CobbAngleTool);
  cornerstoneTools.addTool(ArrowAnnotateTool);
  cornerstoneTools.addTool(PlanarFreehandROITool);
  cornerstoneTools.addTool(EraserTool);
  cornerstoneTools.addTool(KeyImageTool);
  cornerstoneTools.addTool(LabelTool);
  // Define a tool group, which defines how mouse events map to tool commands for
  // Any viewport using the group
  const toolGroup = ToolGroupManager.createToolGroup(toolGroupId);

  // Add the tools to the tool group
  toolGroup.addTool(LengthTool.toolName);
  toolGroup.addTool(HeightTool.toolName);
  toolGroup.addTool(ProbeTool.toolName);
  toolGroup.addTool(RectangleROITool.toolName);
  toolGroup.addTool(EllipticalROITool.toolName);
  toolGroup.addTool(CircleROITool.toolName);
  toolGroup.addTool(BidirectionalTool.toolName);
  toolGroup.addTool(AngleTool.toolName);
  toolGroup.addTool(CobbAngleTool.toolName);
  toolGroup.addTool(ArrowAnnotateTool.toolName, {
    arrowHeadStyle: 'standard',
  });
  toolGroup.addTool(PlanarFreehandROITool.toolName);
  toolGroup.addTool(EraserTool.toolName);
  toolGroup.addTool(KeyImageTool.toolName);
  toolGroup.addTool(LabelTool.toolName);
  // Set the initial state of the tools, here we set one tool active on left click.
  // This means left click will draw that tool.
  toolGroup.setToolActive(toolsNames[0], {
    bindings: [
      {
        mouseButton: MouseBindings.Primary, // Left Click
      },
    ],
  });
  // We set all the other tools passive here, this means that any state is rendered, and editable
  // But aren't actively being drawn (see the toolModes example for information)
  toolGroup.setToolPassive(ProbeTool.toolName);
  toolGroup.setToolPassive(RectangleROITool.toolName);
  toolGroup.setToolPassive(EllipticalROITool.toolName);
  toolGroup.setToolPassive(CircleROITool.toolName);
  toolGroup.setToolPassive(BidirectionalTool.toolName);
  toolGroup.setToolPassive(AngleTool.toolName);
  toolGroup.setToolPassive(ArrowAnnotateTool.toolName);
  toolGroup.setToolPassive(PlanarFreehandROITool.toolName);
  toolGroup.setToolPassive(EraserTool.toolName);

  toolGroup.setToolConfiguration(PlanarFreehandROITool.toolName, {
    calculateStats: true,
  });

  // Get Cornerstone imageIds and fetch metadata into RAM
  const imageIds = await createImageIdsAndCacheMetaData({
    StudyInstanceUID:
      '1.3.6.1.4.1.14519.5.2.1.7009.2403.334240657131972136850343327463',
    SeriesInstanceUID:
      '1.3.6.1.4.1.14519.5.2.1.7009.2403.226151125820845824875394858561',
    wadoRsRoot: 'https://d14fa38qiwhyfd.cloudfront.net/dicomweb',
  });

  // Instantiate a rendering engine
  const renderingEngine = new RenderingEngine(renderingEngineId);

  // Create a stack viewport
  const viewportInput = {
    viewportId,
    type: ViewportType.PLANAR,
    element,
    defaultOptions: {
      background: <Types.Point3>[0.2, 0, 0.2],
    },
  };

  renderingEngine.enableElement(viewportInput);

  // Set the tool group on the viewport
  toolGroup.addViewport(viewportId, renderingEngineId);

  // Get the stack viewport that was created
  const viewport = renderingEngine.getViewport<PlanarViewport>(viewportId);

  // Define a stack containing a single image
  const stack = [imageIds[0]];

  // Set the stack on the viewport
  displaySetRegistry.add(displaySetId, {
    imageIds: stack,
    initialImageIdIndex: 0,
  });

  await viewport.setDisplaySets({ displaySetId });

  // Render the image
  viewport.render();
}

run();
