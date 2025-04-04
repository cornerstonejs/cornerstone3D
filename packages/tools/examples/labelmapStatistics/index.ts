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
  setTitleAndDescription,
  addBrushSizeSlider,
  addSegmentIndexDropdown,
} from '../../../../utils/demo/helpers';
import addButtonToToolbar from '../../../../utils/demo/helpers/addButtonToToolbar';

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

// Add calculate button
addButtonToToolbar({
  title: 'Calculate Statistics',
  onClick: () => {
    // Get the selected mode from the dropdown
    calculateStatistics([1, 2], 'individual');
    calculateStatistics([1, 2], 'collective');
  },
});

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

async function calculateStatistics(indices, mode) {
  const stats = await segmentationUtils.getStatistics({
    segmentationId: 'SEGMENTATION_ID',
    segmentIndices: indices,
    mode,
  });

  if (!stats) {
    return;
  }

  if (mode === 'individual') {
    // Handle individual mode where stats is an object with segment indices as keys
    const segmentStats = stats as { [segmentIndex: number]: any };

    for (const segmentIndex of indices) {
      if (segmentStats[segmentIndex]) {
        const segmentStat = segmentStats[segmentIndex];
        segmentStat.count.label = 'Voxels';
        const items = [`Statistics on segment ${segmentIndex}`];

        items.push(
          displayStat(segmentStat.volume),
          displayStat(segmentStat.count),
          displayStat(segmentStat.mean),
          displayStat(segmentStat.max),
          displayStat(segmentStat.min),
          displayStat(segmentStat.peakValue),
          displayStat(segmentStat.maxLPS),
          displayStat(segmentStat.minLPS)
        );

        const statsDiv = document.getElementById(`segment${segmentIndex}`);
        statsDiv.innerHTML = items.map((span) => `${span}<br />\n`).join('\n');
      }
    }
  } else {
    const items = [`Statistics on ${indices.join(', ')}`];
    // Handle collective mode where stats is a NamedStatistics object
    const namedStats = stats as any;
    namedStats.count.label = 'Voxels';

    items.push(
      displayStat(namedStats.volume),
      displayStat(namedStats.count),
      displayStat(namedStats.mean),
      displayStat(namedStats.max),
      displayStat(namedStats.min),
      displayStat(namedStats.peakValue),
      displayStat(namedStats.maxLPS),
      displayStat(namedStats.minLPS)
    );

    const statsDiv = document.getElementById('segmentCombined');
    statsDiv.innerHTML = items.map((span) => `${span}<br />\n`).join('\n');
  }
}

function segmentationModifiedCallback(evt) {
  const { detail } = evt;
  if (!detail || !detail.segmentIndex || detail.segmentIndex === 255) {
    return;
  }

  // No longer using setTimeout - statistics will be calculated on button click
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

  // const mgimageIds = await createImageIdsAndCacheMetaData({
  //   StudyInstanceUID:
  //     '1.3.6.1.4.1.14519.5.2.1.4792.2001.105216574054253895819671475627',
  //   SeriesInstanceUID:
  //     '1.3.6.1.4.1.14519.5.2.1.4792.2001.326862698868700146219088322924',
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

  addSegmentIndexDropdown('SEGMENTATION_ID', [1, 2]);

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
