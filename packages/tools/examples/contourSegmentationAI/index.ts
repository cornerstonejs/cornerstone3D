import { Enums, RenderingEngine, Types } from '@cornerstonejs/core';
import * as cornerstoneTools from '@cornerstonejs/tools';
import {
  addButtonToToolbar,
  addSliderToToolbar,
  addDropdownToToolbar,
  addToggleButtonToToolbar,
  createImageIdsAndCacheMetaData,
  createInfoSection,
  initDemo,
  setTitleAndDescription,
  addManipulationBindings,
  getLocalUrl,
  addVideoTime,
  addSegmentIndexDropdown,
  contourTools,
} from '../../../../utils/demo/helpers';
import type { Types as cstTypes } from '@cornerstonejs/tools';

// This is for debugging purposes
console.warn(
  'Click on index.ts to open source code for this example --------->'
);

const {
  SegmentationDisplayTool,
  ToolGroupManager,
  Enums: csToolsEnums,
  segmentation,
} = cornerstoneTools;
const { ViewportType } = Enums;

// Define various constants for the tool definition
const toolGroupId = 'DEFAULT_TOOLGROUP_ID';

const segmentationId = `SEGMENTATION_ID`;
let segmentationRepresentationUID = '';
const segmentIndexes = [1, 2, 3, 4, 5];
const segmentVisibilityMap = new Map();

const { toolMap } = contourTools;

// ======== Set up page ======== //

setTitleAndDescription(
  'Contour Segmentation AI',
  'Here we demonstrate how to use various predictive AI/ML techniques to aid your contour segmentation'
);

const size = '500px';
const content = document.getElementById('content');
const viewportGrid = document.createElement('div');
let viewport;

viewportGrid.style.display = 'flex';
viewportGrid.style.flexDirection = 'row';

const viewportId = 'VIEWPORT_ID';
const element = document.createElement('div');

element.oncontextmenu = () => false;
element.style.width = size;
element.style.height = size;

viewportGrid.appendChild(element);

content.appendChild(viewportGrid);

createInfoSection(content, { ordered: true })
  .addInstruction('Select a segmentation index')
  .addInstruction('Select a spline curve type')
  .addInstruction('Draw a spline curve on the viewport')
  .addInstruction('Repeat the steps 1-3 as many times as you want')
  .addInstruction(
    'Notice that each segment index has a different color assigned to it'
  )
  .addInstruction('Change the style for the segmentation')
  .addInstruction('Confirm the style is applied properly');

function getSegmentsVisibilityState() {
  let segmentsVisibility = segmentVisibilityMap.get(segmentationId);

  if (!segmentsVisibility) {
    segmentsVisibility = new Array(segmentIndexes.length + 1).fill(true);
    segmentVisibilityMap.set(segmentationId, segmentsVisibility);
  }

  return segmentsVisibility;
}

function getSegmentationConfig(
  toolGroupdId: string
): cstTypes.RepresentationConfig {
  const segmentationConfig =
    segmentation.config.getSegmentationRepresentationSpecificConfig(
      toolGroupdId,
      segmentationRepresentationUID
    ) ?? {};

  // Add CONTOUR object because getSegmentationRepresentationSpecificConfig
  // can return an empty object
  if (!segmentationConfig.CONTOUR) {
    segmentationConfig.CONTOUR = {};
  }

  return segmentationConfig;
}

function updateSegmentationConfig(config) {
  const segmentationConfig = getSegmentationConfig(toolGroupId);

  Object.assign(segmentationConfig.CONTOUR, config);

  segmentation.config.setSegmentationRepresentationSpecificConfig(
    toolGroupId,
    segmentationRepresentationUID,
    segmentationConfig
  );
}

// ============================= //

const cancelDrawingEventListener = (evt) => {
  const { element, key } = evt.detail;
  if (key === 'Escape') {
    cornerstoneTools.cancelActiveManipulations(element);
  }
};

element.addEventListener(
  csToolsEnums.Events.KEY_DOWN,
  cancelDrawingEventListener
);

addDropdownToToolbar({
  options: { map: toolMap },
  toolGroupId,
});

addSegmentIndexDropdown(segmentationId);

/**
 * Runs the demo
 */
async function run() {
  // Init Cornerstone and related libraries
  await initDemo();

  // Define tool groups to add the segmentation display tool to
  const toolGroup = ToolGroupManager.createToolGroup(toolGroupId);
  addManipulationBindings(toolGroup, { toolMap });

  toolGroup.addTool(SegmentationDisplayTool.toolName);
  toolGroup.setToolEnabled(SegmentationDisplayTool.toolName);

  // Get Cornerstone imageIds and fetch metadata into RAM
  const imageIds = await createImageIdsAndCacheMetaData({
    StudyInstanceUID:
      '1.3.6.1.4.1.14519.5.2.1.7009.2403.334240657131972136850343327463',
    SeriesInstanceUID:
      '1.3.6.1.4.1.14519.5.2.1.7009.2403.226151125820845824875394858561',
    wadoRsRoot: 'https://d3t6nz73ql33tx.cloudfront.net/dicomweb',
  });

  // Instantiate a rendering engine
  const renderingEngineId = 'myRenderingEngine';
  const renderingEngine = new RenderingEngine(renderingEngineId);

  // Create the viewports
  const viewportInputArray = [
    {
      viewportId: viewportId,
      type: ViewportType.STACK,
      element: element,
      defaultOptions: {
        background: <Types.Point3>[0.2, 0, 0.2],
      },
    },
  ];

  renderingEngine.setViewports(viewportInputArray);
  toolGroup.addViewport(viewportId, renderingEngineId);

  // Get the stack viewport that was created
  viewport = <Types.IStackViewport>renderingEngine.getViewport(viewportId);
  addVideoTime(viewportGrid, viewport);

  // Set the stack on the viewport
  await viewport.setStack(imageIds);

  // Render the image
  renderingEngine.render();

  // Add a segmentation that will contains the contour annotations
  segmentation.addSegmentations([
    {
      segmentationId,
      representation: {
        type: csToolsEnums.SegmentationRepresentations.Contour,
      },
    },
  ]);

  // Create a segmentation representation associated to the toolGroupId
  const segmentationRepresentationUIDs =
    await segmentation.addSegmentationRepresentations(toolGroupId, [
      {
        segmentationId,
        type: csToolsEnums.SegmentationRepresentations.Contour,
      },
    ]);

  // Store the segmentation representation that was just created
  [segmentationRepresentationUID] = segmentationRepresentationUIDs;
}

run();
