import { Enums, RenderingEngine, imageLoader } from '@cornerstonejs/core';
import * as cornerstone from '@cornerstonejs/core';
import * as cornerstoneTools from '@cornerstonejs/tools';
import {
  createImageIdsAndCacheMetaData,
  initDemo,
  setCtTransferFunctionForVolumeActor,
  setTitleAndDescription,
} from '../../../../utils/demo/helpers';
import {
  createMockEllipsoidStackSegmentation,
  createMockEllipsoidVolumeSegmentation,
} from '../../../../utils/test/testUtils';

// This is for debugging purposes
console.warn(
  'Click on index.ts to open source code for this example --------->'
);

const {
  ToolGroupManager,
  SegmentationDisplayTool,
  StackScrollMouseWheelTool,
  ZoomTool,
  Enums: csToolsEnums,
  SegmentSelectTool,
  BrushTool,
  PanTool,
  segmentation,
  utilities: cstUtils,
} = cornerstoneTools;

const { MouseBindings, KeyboardBindings } = csToolsEnums;
const { ViewportType } = Enums;

// Define a unique id for the volume
let renderingEngine;
const volumeId = 'myVolume';
const renderingEngineId = 'myRenderingEngine';

const stackViewportId = 'STACK_VIEWPORT';
const volumeViewportId = 'VOLUME_VIEWPORT';

const stackToolGroupId = 'TOOL_GROUP_STACK';
const volumeToolGroupId = 'TOOL_GROUP_VOLUME';

// ======== Set up page ======== //
setTitleAndDescription(
  'Segment Select Tool in Both Stack and Volume Viewport',
  'Here we demonstrate how you can use the Segment Select Tool in both stack and volume viewports to hover and select active segment based on the mouse position.'
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

const brushInstanceNames = {
  CircularBrush: 'CircularBrush',
  CircularEraser: 'CircularEraser',
};

const brushStrategies = {
  [brushInstanceNames.CircularBrush]: 'FILL_INSIDE_CIRCLE',
  [brushInstanceNames.CircularEraser]: 'ERASE_INSIDE_CIRCLE',
};

const stackSegmentationId = 'SEGMENTATION_STACK';
const volumeSegmentationId = 'SEGMENTATION_VOLUME';

// ============================= //

// Add tools to Cornerstone3D
cornerstoneTools.addTool(PanTool);
cornerstoneTools.addTool(ZoomTool);
cornerstoneTools.addTool(StackScrollMouseWheelTool);
cornerstoneTools.addTool(SegmentationDisplayTool);
cornerstoneTools.addTool(BrushTool);
cornerstoneTools.addTool(SegmentSelectTool);

function setupTools(toolGroupId) {
  // Define a tool group, which defines how mouse events map to tool commands for
  // Any viewport using the group
  const toolGroup = ToolGroupManager.createToolGroup(toolGroupId);

  // Manipulation Tools
  toolGroup.addTool(PanTool.toolName);
  toolGroup.addTool(ZoomTool.toolName);
  toolGroup.addTool(StackScrollMouseWheelTool.toolName);

  // Segmentation Tools
  toolGroup.addTool(SegmentationDisplayTool.toolName);
  toolGroup.addTool(SegmentSelectTool.toolName);
  toolGroup.addToolInstance(
    brushInstanceNames.CircularBrush,
    BrushTool.toolName,
    {
      activeStrategy: brushStrategies.CircularBrush,
    }
  );

  toolGroup.setToolEnabled(SegmentationDisplayTool.toolName);
  toolGroup.setToolActive(SegmentSelectTool.toolName);

  toolGroup.setToolActive(brushInstanceNames.CircularBrush, {
    bindings: [{ mouseButton: MouseBindings.Primary }],
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
      {
        mouseButton: MouseBindings.Primary,
        modifierKey: KeyboardBindings.Shift,
      },
    ],
  });

  // As the Stack Scroll mouse wheel is a tool using the `mouseWheelCallback`
  // hook instead of mouse buttons, it does not need to assign any mouse button.
  toolGroup.setToolActive(StackScrollMouseWheelTool.toolName);

  return toolGroup;
}
// ============================= //

/**
 * Runs the demo
 */
async function run() {
  // Init Cornerstone and related libraries
  await initDemo();

  const stackToolGroup = setupTools(stackToolGroupId);
  const volumeToolGroup = setupTools(volumeToolGroupId);

  const stackImageIds = await createImageIdsAndCacheMetaData({
    StudyInstanceUID: '1.2.840.113663.1500.1.248223208.1.1.20110323.105903.687',
    SeriesInstanceUID:
      '1.2.840.113663.1500.1.248223208.2.1.20110323.105903.687',
    SOPInstanceUID: '1.2.840.113663.1500.1.248223208.3.10.20110323.110423.875',
    wadoRsRoot: 'https://d33do7qe4w26qo.cloudfront.net/dicomweb',
  });

  const volumeImageIds = await createImageIdsAndCacheMetaData({
    StudyInstanceUID:
      '1.3.6.1.4.1.14519.5.2.1.7009.2403.871108593056125491804754960339',
    SeriesInstanceUID:
      '1.3.6.1.4.1.14519.5.2.1.7009.2403.367700692008930469189923116409',
    wadoRsRoot: 'https://d33do7qe4w26qo.cloudfront.net/dicomweb',
  });

  // Instantiate a rendering engine
  renderingEngine = new RenderingEngine(renderingEngineId);

  // Create the viewports
  const viewportInputArray = [
    {
      viewportId: stackViewportId,
      type: ViewportType.STACK,
      element: element1,
    },
    {
      viewportId: volumeViewportId,
      type: ViewportType.ORTHOGRAPHIC,
      element: element2,
      defaultOptions: {
        orientation: Enums.OrientationAxis.SAGITTAL,
      },
    },
  ];
  renderingEngine.setViewports(viewportInputArray);

  stackToolGroup.addViewport(stackViewportId, renderingEngineId);
  volumeToolGroup.addViewport(volumeViewportId, renderingEngineId);

  _handleStackViewport(stackImageIds);
  _handleVolumeViewport(volumeImageIds, renderingEngine);
}

run();

async function _handleVolumeViewport(volumeImageIds, renderingEngine) {
  const volume = await cornerstone.volumeLoader.createAndCacheVolume(volumeId, {
    imageIds: volumeImageIds,
  });

  // Set the volume to load
  volume.load();

  // Set volumes on the viewports
  await cornerstone.setVolumesForViewports(
    renderingEngine,
    [{ volumeId, callback: setCtTransferFunctionForVolumeActor }],
    [volumeViewportId]
  );

  // Create a segmentation of the same resolution as the source data
  await cornerstone.volumeLoader.createAndCacheDerivedSegmentationVolume(
    volumeId,
    {
      volumeId: volumeSegmentationId,
    }
  );

  createMockEllipsoidVolumeSegmentation({
    volumeId: volumeSegmentationId,
    cornerstone,
  });

  // Add the segmentations to state
  segmentation.addSegmentations([
    {
      segmentationId: volumeSegmentationId,
      representation: {
        // The type of segmentation
        type: csToolsEnums.SegmentationRepresentations.Labelmap,
        // The actual segmentation data, in the case of labelmap this is a
        // reference to the source volume of the segmentation.
        data: {
          volumeId: volumeSegmentationId,
        },
      },
    },
  ]);

  // Add the segmentation representation to the toolgroup
  segmentation.addSegmentationRepresentations(volumeToolGroupId, [
    {
      segmentationId: volumeSegmentationId,
      type: csToolsEnums.SegmentationRepresentations.Labelmap,
    },
  ]);
}

async function _handleStackViewport(stackImageIds: string[]) {
  const stackViewport = renderingEngine.getViewport(stackViewportId);
  const imageIdsArray = [stackImageIds[0]];

  const { imageIds: segmentationImageIds } =
    await imageLoader.createAndCacheDerivedSegmentationImages(imageIdsArray);

  await stackViewport.setStack(imageIdsArray, 0);

  createMockEllipsoidStackSegmentation({
    imageIds: imageIdsArray,
    segmentationImageIds,
    cornerstone,
  });

  segmentation.addSegmentations([
    {
      segmentationId: stackSegmentationId,
      representation: {
        type: csToolsEnums.SegmentationRepresentations.Labelmap,
        data: {
          imageIdReferenceMap: cstUtils.segmentation.createImageIdReferenceMap(
            imageIdsArray,
            segmentationImageIds
          ),
        },
      },
    },
  ]);

  // Add the segmentation representation to the toolgroup
  await segmentation.addSegmentationRepresentations(stackToolGroupId, [
    {
      segmentationId: stackSegmentationId,
      type: csToolsEnums.SegmentationRepresentations.Labelmap,
    },
  ]);
}
