import { Enums, RenderingEngine, imageLoader } from '@cornerstonejs/core';
import * as cornerstone from '@cornerstonejs/core';
import * as cornerstoneTools from '@cornerstonejs/tools';
import {
  createImageIdsAndCacheMetaData,
  initDemo,
  addDropdownToToolbar,
  setTitleAndDescription,
  addButtonToToolbar,
  addBrushSizeSlider,
  labelmapTools,
  addManipulationBindings,
} from '../../../../utils/demo/helpers';
import { fillStackSegmentationWithMockData } from '../../../../utils/test/testUtils';

// This is for debugging purposes
console.warn(
  'Click on index.ts to open source code for this example --------->'
);

const {
  ToolGroupManager,

  StackScrollMouseWheelTool,
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

const { MouseBindings, KeyboardBindings } = csToolsEnums;
const { ViewportType } = Enums;
const { segmentation: segmentationUtils } = cstUtils;

// Define a unique id for the volume
let renderingEngine;
const renderingEngineId = 'myRenderingEngine';
const viewportId1 = 'VOLUME_VIEWPORT';
const viewportId2 = 'STACK_VIEWPORT';
const toolGroupId = 'TOOL_GROUP_ID';

// ======== Set up page ======== //
setTitleAndDescription(
  'Segmentation in StackViewport',
  'Here we demonstrate how to render a segmentation in StackViewport with a mammography image. We show that even with different stack ordering, we are capable of mathcing the correct labelmap and render them on the second viewport'
);

const size = '500px';
const content = document.getElementById('content');
const viewportGrid = document.createElement('div');

viewportGrid.style.display = 'flex';
viewportGrid.style.display = 'flex';
viewportGrid.style.flexDirection = 'row';

const element1 = document.createElement('div');
element1.oncontextmenu = () => false;

element1.style.width = size;
element1.style.height = size;

viewportGrid.appendChild(element1);

const element2 = document.createElement('div');
element2.oncontextmenu = () => false;

element2.style.width = size;
element2.style.height = size;

viewportGrid.appendChild(element2);

content.appendChild(viewportGrid);

const instructions = document.createElement('p');
instructions.innerText = `
  Left Click: Use selected Segmentation Tool.
  Middle Click: Pan
  Right Click: Zoom
  Mouse wheel: Scroll Stack
  `;

content.append(instructions);

addDropdownToToolbar({
  id: 'LABELMAP_TOOLS_DROPDOWN',
  style: {
    width: '150px',
    marginRight: '10px',
  },
  options: { map: labelmapTools.toolMap, defaultIndex: 0 },
  onSelectedValueChange: (nameAsStringOrNumber) => {
    const tool = String(nameAsStringOrNumber);
    const toolGroup = ToolGroupManager.getToolGroup(toolGroupId);

    // Set the currently active tool disabled
    const toolName = toolGroup.getActivePrimaryMouseButtonTool();

    if (toolName) {
      toolGroup.setToolDisabled(toolName);
    }

    toolGroup.setToolActive(tool, {
      bindings: [{ mouseButton: MouseBindings.Primary }],
    });
  },
  labelText: 'Tools: ',
});

let viewport1;

const segmentationId = 'SEGMENTATION';

addBrushSizeSlider({
  toolGroupId: toolGroupId,
});
// ============================= //

const thresholdOptions = ['CT Fat: (-150, -70)', 'CT Bone: (200, 1000)'];

addDropdownToToolbar({
  options: { values: thresholdOptions, defaultValue: thresholdOptions[0] },
  onSelectedValueChange: (nameAsStringOrNumber) => {
    const name = String(nameAsStringOrNumber);

    let threshold;
    if (name === thresholdOptions[0]) {
      threshold = [-150, -70];
    } else if (name == thresholdOptions[1]) {
      threshold = [100, 1000];
    }

    segmentationUtils.setBrushThresholdForToolGroup(toolGroupId, threshold);
  },
});

/**
 * Runs the demo
 */
async function run() {
  // Init Cornerstone and related libraries
  await initDemo();
  const toolGroup = ToolGroupManager.createToolGroup(toolGroupId);

  addManipulationBindings(toolGroup, { toolMap: labelmapTools.toolMap });

  const imageIds = await createImageIdsAndCacheMetaData({
    StudyInstanceUID:
      '1.3.6.1.4.1.14519.5.2.1.7009.2403.334240657131972136850343327463',
    SeriesInstanceUID:
      '1.3.6.1.4.1.14519.5.2.1.7009.2403.226151125820845824875394858561',
    wadoRsRoot: 'https://d3t6nz73ql33tx.cloudfront.net/dicomweb',
  });

  // Instantiate a rendering engine
  renderingEngine = new RenderingEngine(renderingEngineId);

  // Create the viewports
  const viewportInputArray = [
    {
      viewportId: viewportId1,
      element: element1,
      type: ViewportType.ORTHOGRAPHIC,
      defaultOptions: {
        orientation: 'sagittal',
      },
    },
    {
      viewportId: viewportId2,
      type: ViewportType.STACK,
      element: element2,
    },
  ];
  renderingEngine.setViewports(viewportInputArray);

  toolGroup.addViewport(viewportId1);
  toolGroup.addViewport(viewportId2);

  viewport1 = renderingEngine.getViewport(viewportId1);
  const viewport2 = renderingEngine.getViewport(viewportId2);

  const imageIdsArray = [imageIds[50], imageIds[100]];

  const volumeId = 'VOLUME_ID';
  const volume = await cornerstone.volumeLoader.createAndCacheEmptyVolume(
    volumeId,
    {
      imageIds,
    }
  );

  volume.load();

  await viewport2.setStack(imageIdsArray, 0);

  viewport1.setVolumes([{ volumeId }]);
  renderingEngine.render();

  const segmentationVolumeId = 'SEGMENTATION_VOLUME_ID';

  await cornerstone.volumeLoader.createAndCacheDerivedSegmentationVolume(
    volumeId,
    {
      volumeId: segmentationVolumeId,
    }
  );

  segmentation.addSegmentations([
    {
      segmentationId,
      representation: {
        type: csToolsEnums.SegmentationRepresentations.Labelmap,
        data: {
          volumeId: segmentationVolumeId,
        },
      },
    },
  ]);

  // Add the segmentation representation to the viewport
  await segmentation.addRepresentations(viewportId1, [
    {
      segmentationId,
      type: csToolsEnums.SegmentationRepresentations.Labelmap,
    },
  ]);

  // adding the same segmentation to the stack viewport
  await segmentation.addRepresentations(viewportId2, [
    {
      segmentationId,
      type: csToolsEnums.SegmentationRepresentations.Labelmap,
    },
  ]);
}

run();
