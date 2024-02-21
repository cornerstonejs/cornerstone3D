import {
  Enums,
  RenderingEngine,
  imageLoader,
  utilities as csUtils,
} from '@cornerstonejs/core';
import * as cornerstone from '@cornerstonejs/core';
import * as cornerstoneTools from '@cornerstonejs/tools';
import {
  createImageIdsAndCacheMetaData,
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
  SegmentationDisplayTool,
  Enums: csToolsEnums,
  BrushTool,
  segmentation,
  utilities: cstUtils,
} = cornerstoneTools;

const { MouseBindings } = csToolsEnums;
const { ViewportType } = Enums;

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
element1.style.height = '500px';

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
const segmentationRepresentationUIDs = [];

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

addBrushSizeSlider();

addSegmentIndexDropdown(segmentationId);

// ============================= //

function setupTools(toolGroupId) {
  // Add tools to Cornerstone3D
  cornerstoneTools.addTool(SegmentationDisplayTool);
  cornerstoneTools.addTool(BrushTool);

  // Define a tool group, which defines how mouse events map to tool commands for
  // Any viewport using the group
  const toolGroup = ToolGroupManager.createToolGroup(toolGroupId);
  addManipulationBindings(toolGroup);

  // Segmentation Tools
  toolGroup.addTool(SegmentationDisplayTool.toolName);
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
      strategySpecificConfiguration: {
        useCenterSegmentIndex: true,
        THRESHOLD: { isDynamic: true, dynamicRadius: 3 },
      },
    }
  );

  toolGroup.setToolEnabled(SegmentationDisplayTool.toolName);

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

  const imageIds = await createImageIdsAndCacheMetaData({
    StudyInstanceUID: '2.25.96975534054447904995905761963464388233',
    SeriesInstanceUID: '2.25.15054212212536476297201250326674987992',
    wadoRsRoot:
      getLocalUrl() || 'https://d33do7qe4w26qo.cloudfront.net/dicomweb',
  });

  // Only one SOP instances is DICOM, so find it
  const videoId = imageIds.find(
    (it) => it.indexOf('2.25.179478223177027022014772769075050874231') !== -1
  );

  // Instantiate a rendering engine
  renderingEngine = new RenderingEngine(renderingEngineId);

  // Create the viewports
  const viewportInputArray = [
    {
      viewportId: viewportId,
      type: ViewportType.VIDEO,
      element: element1,
    },
  ];
  renderingEngine.setViewports(viewportInputArray);
  toolGroup.addViewport(viewportId, renderingEngineId);
  viewport = renderingEngine.getViewport(viewportId);

  const imageIdsArray = [videoId];

  await viewport.setVideo(videoId, 1);
  addVideoTime(viewportGrid, viewport);
  // We need the map on all image ids
  const allImageIds = viewport.getImageIds();
  const { imageIds: segmentationImageIds } =
    await imageLoader.createAndCacheDerivedImages(allImageIds, {
      skipCreateBuffer: true,
      onCacheAdd: csUtils.VoxelManager.addInstanceToImage,
    });

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
          imageIdReferenceMap: cstUtils.segmentation.createImageIdReferenceMap(
            allImageIds,
            segmentationImageIds
          ),
        },
      },
    },
  ]);
  // Add the segmentation representation to the toolgroup
  const [uid] = await segmentation.addSegmentationRepresentations(toolGroupId, [
    {
      segmentationId,
      type: csToolsEnums.SegmentationRepresentations.Labelmap,
    },
  ]);

  segmentationRepresentationUIDs.push(uid);
}

run();
