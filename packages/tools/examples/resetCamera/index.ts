import type { PlanarViewport, Types } from '@cornerstonejs/core';
import {
  RenderingEngine,
  Enums,
  volumeLoader,
  getRenderingEngine,
  displaySetRegistry,
} from '@cornerstonejs/core';
import * as cornerstoneTools from '@cornerstonejs/tools';

import {
  initDemo,
  createImageIdsAndCacheMetaData,
  setTitleAndDescription,
  addButtonToToolbar,
  addDropdownToToolbar,
  addToggleButtonToToolbar,
} from '../../../../utils/demo/helpers';
import { ctPresentation } from '../../../../utils/demo/helpers/volumePresentationRecipes';

const {
  PanTool,
  WindowLevelTool,
  StackScrollTool,
  ZoomTool,
  ToolGroupManager,
  Enums: csToolsEnums,
} = cornerstoneTools;

const { ViewportType } = Enums;
const { MouseBindings } = csToolsEnums;

// This is for debugging purposes
console.warn(
  'Click on index.ts to open source code for this example --------->'
);

const renderingEngineId = 'myRenderingEngine';
const viewportIdStack = 'CT_STACK';
const viewportIdVolume = 'CT_VOLUME';

// Define a unique id for the volume
const volumeName = 'CT_VOLUME_ID'; // Id of the volume less loader prefix
const volumeLoaderScheme = 'cornerstoneStreamingImageVolume'; // Loader id which defines which volume loader to use
const volumeId = `${volumeLoaderScheme}:${volumeName}`; // VolumeId with loader id + volume id
const stackDisplaySetId = 'resetCamera:stack';
const volumeDisplaySetId = 'resetCamera:volume';

// ======== Set up page ======== //
setTitleAndDescription(
  'Reset Camera API',
  'Demonstrates Different options for resetting the camera'
);

const content = document.getElementById('content');
const element1 = document.createElement('div');
element1.id = 'cornerstone-element1';
element1.style.width = '512px';
element1.style.height = '512px';

const element2 = document.createElement('div');
element2.id = 'cornerstone-element2';
element2.style.width = '512px';
element2.style.height = '512px';

element1.oncontextmenu = (e) => e.preventDefault();
element2.oncontextmenu = (e) => e.preventDefault();

content.appendChild(element1);
content.appendChild(element2);
// ============================= //

let selectedViewportId = viewportIdStack;
let resetPan = true;
let resetZoom = true;

addDropdownToToolbar({
  options: {
    values: [viewportIdStack, viewportIdVolume],
    defaultValue: viewportIdStack,
  },
  onSelectedValueChange: (value) => {
    selectedViewportId = value as string;
  },
});
// Buttons
addButtonToToolbar({
  title: 'Reset Camera',
  onClick: () => {
    // Get the rendering engine
    const renderingEngine = getRenderingEngine(renderingEngineId);

    // Get the stack viewport
    const viewport =
      renderingEngine.getViewport<PlanarViewport>(selectedViewportId);

    viewport.resetViewState({ resetPan, resetZoom });

    renderingEngine.render();
  },
});

addToggleButtonToToolbar({
  title: 'toggle reset zoom',
  onClick: (toggle) => {
    resetZoom = toggle;
  },
  defaultToggle: true,
});

addToggleButtonToToolbar({
  title: 'toggle reset pan',
  onClick: (toggle) => {
    resetPan = toggle;
  },
  defaultToggle: true,
});

/**
 * Runs the demo
 */
async function run() {
  // Init Cornerstone and related libraries
  await initDemo();

  cornerstoneTools.addTool(PanTool);
  cornerstoneTools.addTool(WindowLevelTool);
  cornerstoneTools.addTool(StackScrollTool);
  cornerstoneTools.addTool(ZoomTool);

  const toolGroup = ToolGroupManager.createToolGroup('toolGroupId');

  // Add tools to the tool group
  toolGroup.addTool(WindowLevelTool.toolName);
  toolGroup.addTool(PanTool.toolName);
  toolGroup.addTool(ZoomTool.toolName);
  toolGroup.addTool(StackScrollTool.toolName);

  // Set the initial state of the tools, here all tools are active and bound to
  // Different mouse inputs
  toolGroup.setToolActive(WindowLevelTool.toolName, {
    bindings: [
      {
        mouseButton: MouseBindings.Primary, // Left Click
      },
    ],
  });
  toolGroup.setToolActive(PanTool.toolName, {
    bindings: [
      {
        mouseButton: MouseBindings.Auxiliary, // Middle Click
      },
    ],
  });
  toolGroup.setToolActive(ZoomTool.toolName, {
    bindings: [
      {
        mouseButton: MouseBindings.Secondary, // Right Click
      },
    ],
  });
  // As the Stack Scroll mouse wheel is a tool using the `mouseWheelCallback`
  // hook instead of mouse buttons, it does not need to assign any mouse button.
  toolGroup.setToolActive(StackScrollTool.toolName, {
    bindings: [{ mouseButton: MouseBindings.Wheel }],
  });

  // Get Cornerstone imageIds and fetch metadata into RAM
  const imageIds = await createImageIdsAndCacheMetaData({
    StudyInstanceUID:
      '1.3.6.1.4.1.14519.5.2.1.7009.2403.334240657131972136850343327463',
    SeriesInstanceUID:
      '1.3.6.1.4.1.14519.5.2.1.7009.2403.226151125820845824875394858561',
    wadoRsRoot: 'https://d14fa38qiwhyfd.cloudfront.net/dicomweb',
  });

  const stackImageIds = await createImageIdsAndCacheMetaData({
    StudyInstanceUID:
      '1.3.6.1.4.1.14519.5.2.1.7009.2403.334240657131972136850343327463',
    SeriesInstanceUID:
      '1.3.6.1.4.1.14519.5.2.1.7009.2403.226151125820845824875394858561',
    wadoRsRoot: 'https://d14fa38qiwhyfd.cloudfront.net/dicomweb',
  });

  // Instantiate a rendering engine
  const renderingEngine = new RenderingEngine(renderingEngineId);

  // Create a stack viewport
  const viewportInputs = [
    {
      viewportId: viewportIdStack,
      type: ViewportType.PLANAR,
      element: element1,
      defaultOptions: {
        background: <Types.Point3>[1, 0.5, 0.2],
      },
    },
    {
      viewportId: viewportIdVolume,
      type: ViewportType.PLANAR,
      element: element2,
      defaultOptions: {
        orientation: Enums.OrientationAxis.SAGITTAL,
        background: <Types.Point3>[0.2, 0, 0.2],
      },
    },
  ];

  renderingEngine.setViewports(viewportInputs);

  // Get the stack viewport that was created
  const stackViewport =
    renderingEngine.getViewport<PlanarViewport>(viewportIdStack);

  displaySetRegistry.add(stackDisplaySetId, {
    imageIds: stackImageIds,
    initialImageIdIndex: 10,
  });

  await stackViewport.setDisplaySets({ displaySetId: stackDisplaySetId });

  const volumeViewport =
    renderingEngine.getViewport<PlanarViewport>(viewportIdVolume);

  // Define a volume in memory
  const volume = await volumeLoader.createAndCacheVolume(volumeId, {
    imageIds,
  });

  // Set the volume to load
  volume.load();

  // Set the volume on the viewport
  displaySetRegistry.add(volumeDisplaySetId, {
    imageIds,
    volumeId,
  });

  await volumeViewport.setDisplaySets({ displaySetId: volumeDisplaySetId });
  volumeViewport.setDisplaySetPresentation(
    volumeDisplaySetId,
    ctPresentation()
  );

  toolGroup.addViewport(viewportIdVolume, renderingEngineId);
  toolGroup.addViewport(viewportIdStack, renderingEngineId);

  // Render the image
  renderingEngine.render();
}

run();
