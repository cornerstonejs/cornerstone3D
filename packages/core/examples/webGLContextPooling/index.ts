import type { Types } from '@cornerstonejs/core';
import {
  RenderingEngine,
  Enums,
  init as csRenderInit,
  getRenderingEngine,
} from '@cornerstonejs/core';
import {
  createImageIdsAndCacheMetaData,
  setTitleAndDescription,
  initProviders,
  initVolumeLoader,
} from '../../../../utils/demo/helpers';
import * as cornerstoneTools from '@cornerstonejs/tools';
import { init as csToolsInit } from '@cornerstonejs/tools';
import cornerstoneDICOMImageLoader from '@cornerstonejs/dicom-image-loader';

const {
  PanTool,
  WindowLevelTool,
  ZoomTool,
  ToolGroupManager,
  StackScrollTool,
  Enums: csToolsEnums,
  synchronizers,
} = cornerstoneTools;

const { ViewportType } = Enums;
const { MouseBindings } = csToolsEnums;
const { createImageSliceSynchronizer } = synchronizers;

// Define unique ids
const renderingEngineId = 'myRenderingEngine';
const toolGroupId = 'STACK_TOOL_GROUP';
const imageSliceSyncronizerId = 'IMAGE_SLICE_SYNCHRONIZER';

// Create viewport IDs for 8x8 grid
const viewportIds: string[] = [];
for (let row = 0; row < 8; row++) {
  for (let col = 0; col < 8; col++) {
    viewportIds.push(`STACK_VIEWPORT_${row}_${col}`);
  }
}

// ResizeObserver setup
let resizeTimeout: number;

// Debounced resize handler
const handleResize = () => {
  clearTimeout(resizeTimeout);
  resizeTimeout = window.setTimeout(() => {
    const renderingEngine = getRenderingEngine(renderingEngineId);
    if (renderingEngine) {
      renderingEngine.resize(true, false);
    }
  }, 50); // 50ms debounce
};

// Create ResizeObserver for dynamic resizing
const resizeObserver = new ResizeObserver(handleResize);

// ======== Set up page ======== //
setTitleAndDescription(
  'WebGL Context Pooling - 8x8 Grid',
  `Demonstrates an 8x8 grid of synchronized stack viewports with configurable WebGL context pooling, use left click to scroll through the stack in all viewports. The current number of WebGL contexts is set to ${
    localStorage.getItem('webglContextCount') || 1
  }.`
);

const content = document.getElementById('content');

// Ensure no scroll overflow
document.body.style.overflow = 'hidden';
content.style.overflow = 'hidden';

// Create WebGL context count control
const controlsDiv = document.createElement('div');
controlsDiv.style.marginBottom = '10px';

const contextCountLabel = document.createElement('label');
contextCountLabel.innerText = 'WebGL Context Count: ';
contextCountLabel.style.marginRight = '10px';

const contextCountDropdown = document.createElement('select');
const contextOptions = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15];

// Get stored value or default to 1
const storedContextCount = localStorage.getItem('webglContextCount');
const currentContextCount = storedContextCount
  ? parseInt(storedContextCount)
  : 1;

contextOptions.forEach((value) => {
  const option = document.createElement('option');
  option.value = value.toString();
  option.text = value.toString();
  if (value === currentContextCount) {
    option.selected = true;
  }
  contextCountDropdown.appendChild(option);
});

contextCountDropdown.addEventListener('change', (e) => {
  const newValue = (e.target as HTMLSelectElement).value;
  localStorage.setItem('webglContextCount', newValue);
  location.reload();
});

controlsDiv.appendChild(contextCountLabel);
controlsDiv.appendChild(contextCountDropdown);
content.appendChild(controlsDiv);

// Create viewport grid container
const viewportGrid = document.createElement('div');
viewportGrid.style.display = 'grid';
viewportGrid.style.gridTemplateColumns = 'repeat(8, 1fr)';
viewportGrid.style.gridTemplateRows = 'repeat(8, 1fr)';
viewportGrid.style.gap = '2px';
viewportGrid.style.width = '100%';
viewportGrid.style.height = 'calc(100vh - 200px)'; // Account for controls and text
viewportGrid.style.backgroundColor = '#000';

content.appendChild(viewportGrid);

// Observe the viewport grid for resize events
resizeObserver.observe(viewportGrid);

// Create viewport elements
const viewportElements: HTMLDivElement[] = [];
const sliceCountElements: HTMLDivElement[] = [];

for (let i = 0; i < 64; i++) {
  const viewportContainer = document.createElement('div');
  viewportContainer.style.position = 'relative';
  viewportContainer.style.width = '100%';
  viewportContainer.style.height = '100%';

  const element = document.createElement('div');
  element.style.width = '100%';
  element.style.height = '100%';
  element.oncontextmenu = (e) => e.preventDefault();

  // Create slice count display
  const sliceCountDiv = document.createElement('div');
  sliceCountDiv.style.position = 'absolute';
  sliceCountDiv.style.top = '5px';
  sliceCountDiv.style.left = '5px';
  sliceCountDiv.style.color = 'white';
  sliceCountDiv.style.backgroundColor = 'rgba(0, 0, 0, 0.5)';
  sliceCountDiv.style.padding = '2px 5px';
  sliceCountDiv.style.fontSize = '12px';
  sliceCountDiv.style.zIndex = '1000';
  sliceCountDiv.style.pointerEvents = 'none';
  sliceCountDiv.innerText = 'Slice: 0/0';

  viewportContainer.appendChild(element);
  viewportContainer.appendChild(sliceCountDiv);
  viewportGrid.appendChild(viewportContainer);

  viewportElements.push(element);
  sliceCountElements.push(sliceCountDiv);
}

/**
 * Update slice count display for a viewport
 */
function updateSliceCount(
  viewportId: string,
  currentIndex: number,
  totalImages: number
) {
  const viewportIndex = viewportIds.indexOf(viewportId);
  if (viewportIndex !== -1) {
    sliceCountElements[viewportIndex].innerText = `Slice: ${
      currentIndex + 1
    }/${totalImages}`;
  }
}

/**
 * Runs the demo
 */
async function run() {
  // Initialize providers and loaders
  initProviders();
  cornerstoneDICOMImageLoader.init();
  initVolumeLoader();

  // Initialize Cornerstone with custom WebGL context count
  // check query params for ?debug=true
  const urlParams = new URLSearchParams(window.location.search);
  const debugMode = urlParams.get('debug') === 'true';

  await csRenderInit({
    rendering: {
      webGlContextCount: currentContextCount,
    },
    debug: {
      statsOverlay: debugMode,
    },
  });

  // Initialize cornerstone tools
  await csToolsInit();

  // Add tools to Cornerstone3D
  cornerstoneTools.addTool(PanTool);
  cornerstoneTools.addTool(WindowLevelTool);
  cornerstoneTools.addTool(StackScrollTool);
  cornerstoneTools.addTool(ZoomTool);

  // Create a tool group for all viewports
  const toolGroup = ToolGroupManager.createToolGroup(toolGroupId);

  // Add tools to the tool group
  toolGroup.addTool(StackScrollTool.toolName);

  // Set the initial state of the tools
  toolGroup.setToolActive(StackScrollTool.toolName, {
    bindings: [
      {
        mouseButton: MouseBindings.Primary, // Left Click
      },
    ],
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

  // Create the viewports
  const viewportInputArray: Types.PublicViewportInput[] = viewportIds.map(
    (viewportId, index) => ({
      viewportId,
      type: ViewportType.STACK,
      element: viewportElements[index],
      defaultOptions: {
        background: <Types.Point3>[0.1, 0.1, 0.1],
      },
    })
  );

  renderingEngine.setViewports(viewportInputArray);

  // Set the tool group on all viewports
  viewportIds.forEach((viewportId) => {
    toolGroup.addViewport(viewportId, renderingEngineId);
  });

  // Get all stack viewports
  const stackViewports = renderingEngine.getStackViewports();

  // Set the stack on each viewport
  await Promise.all(
    stackViewports.map(async (viewport) => {
      await viewport.setStack(imageIds);

      // Update initial slice count
      updateSliceCount(
        viewport.id,
        viewport.getCurrentImageIdIndex(),
        imageIds.length
      );

      // Add event listener for stack scroll
      viewport.element.addEventListener(Enums.Events.STACK_VIEWPORT_SCROLL, ((
        evt: Types.EventTypes.StackViewportScrollEvent
      ) => {
        updateSliceCount(
          viewport.id,
          evt.detail.newImageIdIndex,
          imageIds.length
        );
      }) as EventListener);
    })
  );

  // Create and configure the image slice synchronizer
  const imageSliceSynchronizer = createImageSliceSynchronizer(
    imageSliceSyncronizerId
  );

  // Add all viewports to the synchronizer
  viewportIds.forEach((viewportId) => {
    imageSliceSynchronizer.add({
      renderingEngineId,
      viewportId,
    });
  });

  // Enable stack prefetch for all viewports
  stackViewports.forEach((viewport) => {
    cornerstoneTools.utilities.stackPrefetch.enable(viewport.element);
  });

  // Render all viewports
  renderingEngine.renderViewports(viewportIds);
}

run();
