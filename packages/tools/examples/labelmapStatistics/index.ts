import {
  RenderingEngine,
  Enums,
  imageLoader,
  eventTarget,
} from '@cornerstonejs/core';
import * as cornerstoneTools from '@cornerstonejs/tools';
import {
  createImageIdsAndCacheMetaData,
  initDemo,
  addDropdownToToolbar,
  setTitleAndDescription,
  addButtonToToolbar,
  addBrushSizeSlider,
} from '../../../../utils/demo/helpers';

// This is for debugging purposes
console.debug(
  'Click on index.ts to open source code for this example --------->'
);

const {
  ToolGroupManager,
  ZoomTool,
  StackScrollTool,
  Enums: csToolsEnums,
  RectangleScissorsTool,
  CircleScissorsTool,
  BrushTool,
  PaintFillTool,
  PanTool,
  segmentation,
  utilities: cstUtils,
} = cornerstoneTools;

const { MouseBindings, KeyboardBindings, Events } = csToolsEnums;
const { ViewportType } = Enums;
const { segmentation: segmentationUtils, roundNumber } = cstUtils;

// Define a unique id for the volume
let renderingEngine;
const renderingEngineId = 'myRenderingEngine';
const viewportId = 'STACK_VIEWPORT';
const toolGroupId = 'TOOL_GROUP_ID';

// ======== Set up page ======== //
setTitleAndDescription(
  'Stack Segmentation Statistics',
  'Here we demonstrate how to calculate statistics for a stack segmentation.'
);

const size = '500px';
const content = document.getElementById('content');

const statsGrid = document.createElement('div');
statsGrid.style.display = 'flex';
statsGrid.style.flexDirection = 'row';
statsGrid.style.fontSize = 'smaller';

const statsIds = ['segment1', 'segment2', 'segmentCombined'];
const statsStyle = {
  width: '20em',
  height: '10em',
};

for (const statsId of statsIds) {
  const statsDiv = document.createElement('div');
  statsDiv.id = statsId;
  statsDiv.innerText = statsId;
  Object.assign(statsDiv.style, statsStyle);
  statsGrid.appendChild(statsDiv);
}

content.appendChild(statsGrid);

const viewportGrid = document.createElement('div');
viewportGrid.style.display = 'flex';
viewportGrid.style.flexDirection = 'row';

const element = document.createElement('div');
element.style.width = size;
element.style.height = size;
element.oncontextmenu = () => false;

viewportGrid.appendChild(element);
content.appendChild(viewportGrid);

const instructions = document.createElement('p');
instructions.innerText = `
  Left Click: Use selected Segmentation Tool.
  Middle Click: Pan
  Right Click: Zoom
  Mouse wheel: Scroll Stack
  `;

content.append(instructions);

// ============================= //

function displayStat(stat) {
  if (!stat) {
    return;
  }
  return `${stat.label || stat.name}: ${roundNumber(stat.value)} ${
    stat.unit ? stat.unit : ''
  }`;
}

async function calculateStatistics(id, indices) {
  const viewport = renderingEngine.getViewport(viewportId);
  const stats = await segmentationUtils.getStatistics({
    segmentationId: 'SEGMENTATION_ID',
    segmentIndices: indices,
  });

  if (!stats) {
    return;
  }
  const items = [`Statistics on ${indices.join(', ')}`];
  stats.count.label = 'Voxels';

  items.push(
    displayStat(stats.volume),
    displayStat(stats.count),
    displayStat(stats.mean),
    displayStat(stats.max),
    displayStat(stats.min),
    displayStat(stats.peakValue)
  );
  const statsDiv = document.getElementById(id);
  statsDiv.innerHTML = items.map((span) => `${span}<br />\n`).join('\n');
}

let timeoutId;

function segmentationModifiedCallback(evt) {
  const { detail } = evt;
  if (!detail || !detail.segmentIndex || detail.segmentIndex === 255) {
    return;
  }

  const statsId = detail.segmentIndex === 1 ? statsIds[0] : statsIds[1];

  const debounced = () => {
    calculateStatistics(statsId, [detail.segmentIndex]);
    // Also update combined stats
    calculateStatistics(statsIds[2], [1, 2]);
  };

  if (timeoutId) {
    window.clearTimeout(timeoutId);
  }

  timeoutId = window.setTimeout(debounced, 1000);
}

// ============================= //

function setupTools() {
  // Add tools to Cornerstone3D
  cornerstoneTools.addTool(PanTool);
  cornerstoneTools.addTool(ZoomTool);
  cornerstoneTools.addTool(StackScrollTool);
  cornerstoneTools.addTool(RectangleScissorsTool);
  cornerstoneTools.addTool(CircleScissorsTool);
  cornerstoneTools.addTool(PaintFillTool);
  cornerstoneTools.addTool(BrushTool);

  // Define a tool group
  const toolGroup = ToolGroupManager.createToolGroup(toolGroupId);

  // Add tools to the group
  toolGroup.addTool(PanTool.toolName);
  toolGroup.addTool(ZoomTool.toolName);
  toolGroup.addTool(StackScrollTool.toolName);
  toolGroup.addTool(RectangleScissorsTool.toolName);
  toolGroup.addTool(CircleScissorsTool.toolName);
  toolGroup.addTool(PaintFillTool.toolName);
  toolGroup.addTool(BrushTool.toolName);

  // Set tool modes
  toolGroup.setToolActive(BrushTool.toolName, {
    bindings: [{ mouseButton: MouseBindings.Primary }],
  });

  toolGroup.setToolActive(PanTool.toolName, {
    bindings: [
      {
        mouseButton: MouseBindings.Auxiliary,
      },
      {
        mouseButton: MouseBindings.Primary,
        modifierKey: KeyboardBindings.Ctrl,
      },
    ],
  });

  toolGroup.setToolActive(ZoomTool.toolName, {
    bindings: [
      {
        mouseButton: MouseBindings.Secondary,
      },
      {
        mouseButton: MouseBindings.Primary,
        modifierKey: KeyboardBindings.Shift,
      },
    ],
  });

  toolGroup.setToolActive(StackScrollTool.toolName, {
    bindings: [{ mouseButton: MouseBindings.Wheel }],
  });

  return toolGroup;
}

// ============================= //

/**
 * Runs the demo
 */
async function run() {
  // Init Cornerstone and related libraries
  await initDemo();

  const toolGroup = setupTools();

  // Get Cornerstone imageIds and fetch metadata into RAM
  const imageIds = await createImageIdsAndCacheMetaData({
    StudyInstanceUID:
      '1.3.6.1.4.1.14519.5.2.1.7009.2403.334240657131972136850343327463',
    SeriesInstanceUID:
      '1.3.6.1.4.1.14519.5.2.1.7009.2403.226151125820845824875394858561',
    wadoRsRoot: 'https://d14fa38qiwhyfd.cloudfront.net/dicomweb',
  });
  // Get Cornerstone imageIds and fetch metadata into RAM
  // const imageIds = await createImageIdsAndCacheMetaData({
  //   StudyInstanceUID:
  //     '1.3.6.1.4.1.14519.5.2.1.1188.2803.137585363493444318569098508293',
  //   SeriesInstanceUID:
  //     '1.3.6.1.4.1.14519.5.2.1.1188.2803.699272945123913604672897602509',
  //   SOPInstanceUID:
  //     '1.3.6.1.4.1.14519.5.2.1.1188.2803.295285318555680716246271899544',
  //   wadoRsRoot: 'https://d14fa38qiwhyfd.cloudfront.net/dicomweb',
  // });
  // const imageIds2 = await createImageIdsAndCacheMetaData({
  //   StudyInstanceUID: '1.2.840.113663.1500.1.248223208.1.1.20110323.105903.687',
  //   SeriesInstanceUID:
  //     '1.2.840.113663.1500.1.248223208.2.1.20110323.105903.687',
  //   SOPInstanceUID: '1.2.840.113663.1500.1.248223208.3.10.20110323.110423.875',
  //   wadoRsRoot: 'https://d14fa38qiwhyfd.cloudfront.net/dicomweb',
  // });

  // Create a stack of images
  const imageIdsArray = imageIds.slice(0, 10);
  // Create segmentation images for the stack
  const segImages = await imageLoader.createAndCacheDerivedLabelmapImages(
    imageIdsArray
  );

  // Instantiate a rendering engine
  renderingEngine = new RenderingEngine(renderingEngineId);

  // Create the viewport
  const viewportInput = {
    viewportId,
    type: ViewportType.STACK,
    element,
  };

  renderingEngine.setViewports([viewportInput]);

  const viewport = renderingEngine.getViewport(viewportId);
  await viewport.setStack(imageIdsArray, 0);

  // Add the viewport to the toolgroup
  toolGroup.addViewport(viewportId, renderingEngineId);

  // Add segmentation
  segmentation.addSegmentations([
    {
      segmentationId: 'SEGMENTATION_ID',
      representation: {
        type: csToolsEnums.SegmentationRepresentations.Labelmap,
        data: {
          imageIds: segImages.map((it) => it.imageId),
        },
      },
    },
  ]);

  // Add the segmentation representation to the viewport
  await segmentation.addSegmentationRepresentations(viewportId, [
    {
      segmentationId: 'SEGMENTATION_ID',
      type: csToolsEnums.SegmentationRepresentations.Labelmap,
    },
  ]);

  // Add brush size slider
  addBrushSizeSlider({
    toolGroupId,
  });

  cornerstoneTools.utilities.stackContextPrefetch.enable(element);

  // Add segmentation modified callback
  eventTarget.addEventListener(
    Events.SEGMENTATION_DATA_MODIFIED,
    segmentationModifiedCallback
  );

  // Render the image
  renderingEngine.render();
}

run();
