import {
  Enums,
  RenderingEngine,
  imageLoader,
  utilities as csUtils,
} from '@cornerstonejs/core';
import * as cornerstone from '@cornerstonejs/core';
import * as cornerstoneTools from '@cornerstonejs/tools';
import {
  createDisplaySets,
  getViewportTypeForDisplaySet,
  initDemo,
  addDropdownToToolbar,
  setTitleAndDescription,
  getLocalUrl,
  addManipulationBindings,
  addVideoTime,
  addBrushSizeSlider,
  addSegmentIndexDropdown,
} from '../../../../utils/demo/helpers';
import { fillStackSegmentationWithMockData } from '../../../../utils/test/testUtils';

// This is for debugging purposes
console.warn(
  'Click on index.ts to open source code for this example --------->'
);

const {
  ToolGroupManager,

  Enums: csToolsEnums,
  BrushTool,
  segmentation,
} = cornerstoneTools;

const { MouseBindings } = csToolsEnums;

// Define a unique id for the volume
let renderingEngine;
const renderingEngineId = 'myRenderingEngine';
const viewportId = 'VIDEO_VIEWPORT';
const toolGroupId = 'TOOL_GROUP_ID';

// ======== Set up page ======== //
setTitleAndDescription(
  'Segmentation in VideoViewport',
  'Here we demonstrate how to render a labelmap based segmentation on a VideoViewport'
);

const size = '1920px';
const content = document.getElementById('content');
const viewportGrid = document.createElement('div');

viewportGrid.style.display = 'flex';
viewportGrid.style.display = 'flex';
viewportGrid.style.flexDirection = 'row';

const element1 = document.createElement('div');
element1.oncontextmenu = () => false;

element1.style.width = size;
element1.style.height = '512px';

viewportGrid.appendChild(element1);

content.appendChild(viewportGrid);

const instructions = document.createElement('p');
instructions.innerText = `
  Left Click: Use selected Segmentation Tool.
  Middle Click: Pan
  Right Click: Zoom
  Mouse wheel: Scroll Stack
  `;

content.append(instructions);

const brushInstanceNames = {
  CircularBrush: 'CircularBrush',
  CircularEraser: 'CircularEraser',
  DynamicThreshold: 'DynamicThreshold',
};

const brushStrategies = {
  [brushInstanceNames.CircularBrush]: 'FILL_INSIDE_CIRCLE',
  [brushInstanceNames.CircularEraser]: 'ERASE_INSIDE_CIRCLE',
  [brushInstanceNames.DynamicThreshold]: 'THRESHOLD_INSIDE_CIRCLE',
};

const brushValues = [
  brushInstanceNames.CircularBrush,
  brushInstanceNames.DynamicThreshold,
  brushInstanceNames.CircularEraser,
];

const optionsValues = [...brushValues];

let viewport;

const segmentationId = 'VIDEO_SEGMENTATION';

// ============================= //
addDropdownToToolbar({
  options: { values: optionsValues, defaultValue: BrushTool.toolName },
  onSelectedValueChange: (nameAsStringOrNumber) => {
    const name = String(nameAsStringOrNumber);
    const toolGroup = ToolGroupManager.getToolGroup(toolGroupId);

    // Set the currently active tool disabled
    const toolName = toolGroup.getActivePrimaryMouseButtonTool();

    if (toolName) {
      toolGroup.setToolDisabled(toolName);
    }

    if (brushValues.includes(name)) {
      toolGroup.setToolActive(name, {
        bindings: [{ mouseButton: MouseBindings.Primary }],
      });
    } else {
      const toolName = name;

      toolGroup.setToolActive(toolName, {
        bindings: [{ mouseButton: MouseBindings.Primary }],
      });
    }
  },
});

addBrushSizeSlider({});

addSegmentIndexDropdown(segmentationId);

// ============================= //

function setupTools(toolGroupId) {
  // Add tools to Cornerstone3D
  cornerstoneTools.addTool(BrushTool);

  // Define a tool group, which defines how mouse events map to tool commands for
  // Any viewport using the group
  const toolGroup = ToolGroupManager.createToolGroup(toolGroupId);
  addManipulationBindings(toolGroup);

  // Segmentation Tools
  toolGroup.addToolInstance(
    brushInstanceNames.CircularBrush,
    BrushTool.toolName,
    {
      activeStrategy: brushStrategies.CircularBrush,
    }
  );
  toolGroup.addToolInstance(
    brushInstanceNames.CircularEraser,
    BrushTool.toolName,
    {
      activeStrategy: brushStrategies.CircularEraser,
    }
  );
  toolGroup.addToolInstance(
    brushInstanceNames.DynamicThreshold,
    BrushTool.toolName,
    {
      activeStrategy: brushStrategies.DynamicThreshold,
      preview: {
        enabled: true,
      },
      useCenterSegmentIndex: true,
      threshold: {
        isDynamic: true,
        dynamicRadius: 3,
      },
    }
  );

  toolGroup.setToolActive(optionsValues[0], {
    bindings: [{ mouseButton: MouseBindings.Primary }],
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

  const toolGroup = setupTools(toolGroupId);

  const displaySets = await createDisplaySets({
    StudyInstanceUID: '2.25.96975534054447904995905761963464388233',
    SeriesInstanceUID: '2.25.15054212212536476297201250326674987992',
    wadoRsRoot:
      getLocalUrl() || 'https://d14fa38qiwhyfd.cloudfront.net/dicomweb',
  });

  const [displaySet] = displaySets;
  if (!displaySet) {
    throw new Error('No display set found in series');
  }
  const videoId = displaySet.instances[0].imageId;

  // Instantiate a rendering engine
  renderingEngine = new RenderingEngine(renderingEngineId);

  // Create the viewports
  const viewportInputArray = [
    {
      viewportId: viewportId,
      type: getViewportTypeForDisplaySet(displaySet),
      element: element1,
    },
  ];
  renderingEngine.setViewports(viewportInputArray);
  toolGroup.addViewport(viewportId, renderingEngineId);
  viewport = renderingEngine.getViewport(viewportId);

  const imageIdsArray = [videoId];

  await viewport.setDisplaySets({ displaySetId: videoId });
  addVideoTime(viewportGrid, viewport);
  // We need the map on all image ids
  const allImageIds = viewport.getImageIds();
  const firstImage = allImageIds[0];
  const segImages = await imageLoader.createAndCacheDerivedImages(
    [firstImage],
    {
      skipCreateBuffer: true,
      onCacheAdd: csUtils.VoxelManager.addInstanceToImage,
    }
  );

  const segmentationImageIds = segImages.map((it) => it.imageId);

  fillStackSegmentationWithMockData({
    imageIds: imageIdsArray,
    segmentationImageIds,
    cornerstone,
  });

  renderingEngine.renderViewports([viewportId]);

  segmentation.addSegmentations([
    {
      segmentationId,
      representation: {
        type: csToolsEnums.SegmentationRepresentations.Labelmap,
        data: {
          imageIds: segmentationImageIds,
        },
      },
    },
  ]);
  // Add the segmentation representation to the viewport
  await segmentation.addSegmentationRepresentations(viewport.id, [
    {
      segmentationId,
      type: csToolsEnums.SegmentationRepresentations.Labelmap,
    },
  ]);
}

run();
