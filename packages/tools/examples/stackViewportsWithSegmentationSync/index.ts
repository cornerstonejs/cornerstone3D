import type { Types } from '@cornerstonejs/core';
import { RenderingEngine, Enums, imageLoader } from '@cornerstonejs/core';
import {
  initDemo,
  createImageIdsAndCacheMetaData,
  setTitleAndDescription,
} from '../../../../utils/demo/helpers';
import * as cornerstoneTools from '@cornerstonejs/tools';

// This is for debugging purposes
console.warn(
  'Click on index.ts to open source code for this example --------->'
);

const {
  PanTool,
  WindowLevelTool,
  ZoomTool,
  ToolGroupManager,
  StackScrollTool,
  Enums: csToolsEnums,
  synchronizers,
  SynchronizerManager,
  segmentation,
  BrushTool,
} = cornerstoneTools;

const { ViewportType } = Enums;
const { MouseBindings } = csToolsEnums;
const { SegmentationRepresentations } = csToolsEnums;

const { createImageSliceSynchronizer } = synchronizers;

// Define unique ids
const imageSliceSync = 'IMAGE_SLICE_SYNCHRONIZER_ID';
const renderingEngineId = 'myRenderingEngine';
const viewportIds = ['STACK_VIEWPORT_1', 'STACK_VIEWPORT_2'];
const toolGroupId1 = 'TOOL_GROUP_ID_1'; // Tool group for left viewport (with segmentation)
const toolGroupId2 = 'TOOL_GROUP_ID_2'; // Tool group for right viewport (without segmentation)
const segmentationId = 'MY_SEGMENTATION_ID';

// ======== Set up page ======== //
setTitleAndDescription(
  'Stack Viewports with Segmentation Sync',
  'This example demonstrates two stack viewports where one has segmentation and one does not. Both viewports are synchronized using the image slice synchronizer, and the scroll tool is active on both. You can draw segmentation on the left viewport and scroll through both viewports which will stay in sync.'
);

const size = '500px';
const content = document.getElementById('content');
const viewportGrid = document.createElement('div');

viewportGrid.style.display = 'flex';
viewportGrid.style.flexDirection = 'row';

const element1 = document.createElement('div');
const element2 = document.createElement('div');
element1.style.width = size;
element1.style.height = size;
element2.style.width = size;
element2.style.height = size;

// Disable right click context menu so we can have right click tools
element1.oncontextmenu = (e) => e.preventDefault();
element2.oncontextmenu = (e) => e.preventDefault();

viewportGrid.appendChild(element1);
viewportGrid.appendChild(element2);

content.appendChild(viewportGrid);

const instructions = document.createElement('p');
instructions.innerText = `
Left Viewport: Stack with Segmentation
- Left Click: Brush tool for segmentation
- Middle Click: Pan
- Right Click: Zoom
- Mouse Wheel: Scroll through stack

Right Viewport: Stack without Segmentation
- Left Click: Window/Level
- Middle Click: Pan
- Right Click: Zoom
- Mouse Wheel: Scroll through stack

Both viewports are synchronized - scrolling in one will update the other.
`;

content.append(instructions);
// ============================= //

/**
 * Runs the demo
 */
async function run() {
  // Init Cornerstone and related libraries
  await initDemo();

  // Add tools to Cornerstone3D
  cornerstoneTools.addTool(PanTool);
  cornerstoneTools.addTool(WindowLevelTool);
  cornerstoneTools.addTool(StackScrollTool);
  cornerstoneTools.addTool(ZoomTool);
  cornerstoneTools.addTool(BrushTool);

  // Create tool group for left viewport (with segmentation)
  const toolGroup1 = ToolGroupManager.createToolGroup(toolGroupId1);

  // Add tools to the first tool group
  toolGroup1.addTool(PanTool.toolName);
  toolGroup1.addTool(ZoomTool.toolName);
  toolGroup1.addTool(StackScrollTool.toolName);
  toolGroup1.addTool(BrushTool.toolName);

  // Set tool bindings for first viewport (segmentation viewport)
  toolGroup1.setToolActive(BrushTool.toolName, {
    bindings: [
      {
        mouseButton: MouseBindings.Primary, // Left Click for brush
      },
    ],
  });
  toolGroup1.setToolActive(PanTool.toolName, {
    bindings: [
      {
        mouseButton: MouseBindings.Auxiliary, // Middle Click
      },
    ],
  });
  toolGroup1.setToolActive(ZoomTool.toolName, {
    bindings: [
      {
        mouseButton: MouseBindings.Secondary, // Right Click
      },
    ],
  });
  toolGroup1.setToolActive(StackScrollTool.toolName, {
    bindings: [{ mouseButton: MouseBindings.Wheel }],
  });

  // Create tool group for right viewport (without segmentation)
  const toolGroup2 = ToolGroupManager.createToolGroup(toolGroupId2);

  // Add tools to the second tool group
  toolGroup2.addTool(WindowLevelTool.toolName);
  toolGroup2.addTool(PanTool.toolName);
  toolGroup2.addTool(ZoomTool.toolName);
  toolGroup2.addTool(StackScrollTool.toolName);

  // Set tool bindings for second viewport (no segmentation)
  toolGroup2.setToolActive(WindowLevelTool.toolName, {
    bindings: [
      {
        mouseButton: MouseBindings.Primary, // Left Click for window/level
      },
    ],
  });
  toolGroup2.setToolActive(PanTool.toolName, {
    bindings: [
      {
        mouseButton: MouseBindings.Auxiliary, // Middle Click
      },
    ],
  });
  toolGroup2.setToolActive(ZoomTool.toolName, {
    bindings: [
      {
        mouseButton: MouseBindings.Secondary, // Right Click
      },
    ],
  });
  toolGroup2.setToolActive(StackScrollTool.toolName, {
    bindings: [{ mouseButton: MouseBindings.Wheel }],
  });

  // Create synchronizers
  createImageSliceSynchronizer(imageSliceSync);

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
  const viewportInputArray = [
    {
      viewportId: viewportIds[0],
      type: ViewportType.STACK,
      element: element1,
      defaultOptions: {
        background: <Types.Point3>[0.2, 0, 0.2],
      },
    },
    {
      viewportId: viewportIds[1],
      type: ViewportType.STACK,
      element: element2,
      defaultOptions: {
        background: <Types.Point3>[0.2, 0, 0.2],
      },
    },
  ];

  renderingEngine.setViewports(viewportInputArray);

  // Set the tool groups on the viewports
  toolGroup1.addViewport(viewportIds[0], renderingEngineId); // Left viewport with segmentation
  toolGroup2.addViewport(viewportIds[1], renderingEngineId); // Right viewport without segmentation

  // Get the stack viewports
  const stackViewports = renderingEngine.getStackViewports();

  // Set the stack on each viewport
  await stackViewports[0].setStack(imageIds);
  await stackViewports[1].setStack(imageIds);

  // Enable stack prefetch for both viewports
  cornerstoneTools.utilities.stackPrefetch.enable(stackViewports[0].element);
  cornerstoneTools.utilities.stackPrefetch.enable(stackViewports[1].element);

  // Render the viewports
  renderingEngine.renderViewports(viewportIds);

  // Create segmentation labelmap images
  const segmentationImages =
    await imageLoader.createAndCacheDerivedLabelmapImages(imageIds);

  // Add the segmentation to the state
  segmentation.addSegmentations([
    {
      segmentationId,
      representation: {
        type: SegmentationRepresentations.Labelmap,
        data: {
          imageIds: segmentationImages.map((image) => image.imageId),
        },
      },
    },
  ]);

  // Add segmentation representation only to the first viewport
  const segmentationRepresentation = {
    segmentationId,
    type: SegmentationRepresentations.Labelmap,
  };

  await segmentation.addLabelmapRepresentationToViewportMap({
    [viewportIds[0]]: [segmentationRepresentation],
  });

  // Set up the synchronizer
  const synchronizer = SynchronizerManager.getSynchronizer(imageSliceSync);

  if (synchronizer) {
    synchronizer.add({ renderingEngineId, viewportId: viewportIds[0] });
    synchronizer.add({ renderingEngineId, viewportId: viewportIds[1] });
  }
}

run();
