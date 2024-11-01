import { Enums, RenderingEngine, imageLoader } from '@cornerstonejs/core';
import * as cornerstone from '@cornerstonejs/core';
import * as cornerstoneTools from '@cornerstonejs/tools';
import {
  addManipulationBindings,
  createImageIdsAndCacheMetaData,
  initDemo,
  setCtTransferFunctionForVolumeActor,
  setTitleAndDescription,
} from '../../../../utils/demo/helpers';
import {
  fillStackSegmentationWithMockData,
  fillVolumeLabelmapWithMockData,
  addMockContourSegmentation,
} from '../../../../utils/test/testUtils';
import type { IStreamingImageVolume } from '@cornerstonejs/core/types';

// This is for debugging purposes
console.warn(
  'Click on index.ts to open source code for this example --------->'
);

const {
  ToolGroupManager,

  Enums: csToolsEnums,
  SegmentSelectTool,
  segmentation,
  PlanarFreehandContourSegmentationTool,
  utilities: cstUtils,
} = cornerstoneTools;

const { MouseBindings } = csToolsEnums;
const { ViewportType } = Enums;

// Define a unique id for the volume
let renderingEngine;
const volumeId = 'myVolume';
const renderingEngineId = 'myRenderingEngine';

// ======== Set up page ======== //
setTitleAndDescription(
  'Segment Select Tool in Both Stack and Volume Viewport',
  'Here, we demonstrate how you can use the Segment Select Tool in both stack and volume viewports to hover and select the active segment based on the mouse position. It works after some deliberate delay. In the first row, you can use the brushes to select the active segment on the labelmap data. And for the second row viewports, you can use annotation tools and contour segmentation to select the active segment on the volume data.'
);

const size = '500px';

const content = document.getElementById('content');
const viewportGrid = document.createElement('div');

viewportGrid.style.display = 'flex';
viewportGrid.style.flexWrap = 'wrap';
viewportGrid.style.width = '1000px'; // Add this line to limit grid width

const row1 = document.createElement('div');
row1.style.display = 'flex';
row1.style.flexDirection = 'row';

const row2 = document.createElement('div');
row2.style.display = 'flex';
row2.style.flexDirection = 'row';

const elements = [];
for (let i = 1; i <= 4; i++) {
  const element = document.createElement('div');
  element.oncontextmenu = () => false;
  element.style.width = size;
  element.style.height = size;
  elements.push(element);

  if (i <= 2) {
    row1.appendChild(element);
  } else {
    row2.appendChild(element);
  }
}

const [element1, element2, element3, element4] = elements;

viewportGrid.appendChild(row1);
viewportGrid.appendChild(row2);

content.appendChild(viewportGrid);

const stackSegLabelmapId = 'SEGMENTATION_LABELMAP_STACK';
const volumeSegLabelmapId = 'SEGMENTATION_LABELMAP_VOLUME';
const stackSegContourId = 'SEGMENTATION_CONTOUR_STACK';
const volumeSegContourId = 'SEGMENTATION_CONTOUR_VOLUME';

const stackSegLabelmapToolGroupId = 'TOOL_GROUP_STACK';
const volumeSegLabelmapToolGroupId = 'TOOL_GROUP_VOLUME';
const stackSegContourToolGroupId = 'TOOL_GROUP_STACK_CONTOUR';
const volumeSegContourToolGroupId = 'TOOL_GROUP_VOLUME_CONTOUR';

const viewportId1 = 'viewport1';
const viewportId2 = 'viewport2';
const viewportId3 = 'viewport3';
const viewportId4 = 'viewport4';

// ============================= //

cornerstoneTools.addTool(SegmentSelectTool);
cornerstoneTools.addTool(PlanarFreehandContourSegmentationTool);

function setupTools(toolGroupId, isContour = false) {
  // Define a tool group, which defines how mouse events map to tool commands for
  // Any viewport using the group
  const toolGroup = ToolGroupManager.createToolGroup(toolGroupId);

  if (isContour) {
    toolGroup.addTool(PlanarFreehandContourSegmentationTool.toolName);
    toolGroup.setToolPassive(PlanarFreehandContourSegmentationTool.toolName);
  }

  addManipulationBindings(toolGroup);

  // Segmentation Tools
  toolGroup.addTool(SegmentSelectTool.toolName);

  toolGroup.setToolActive(SegmentSelectTool.toolName);

  if (isContour) {
    toolGroup.setToolActive(PlanarFreehandContourSegmentationTool.toolName, {
      bindings: [
        {
          mouseButton: MouseBindings.Primary,
        },
      ],
    });
  }

  return toolGroup;
}

/**
 * Runs the demo
 */
async function run() {
  // Init Cornerstone and related libraries
  await initDemo();

  const stackLabelmapToolGroup = setupTools(stackSegLabelmapToolGroupId);
  const volumeLabelmapToolGroup = setupTools(volumeSegLabelmapToolGroupId);
  const stackContourToolGroup = setupTools(stackSegContourToolGroupId, true);
  const volumeContourToolGroup = setupTools(volumeSegContourToolGroupId, true);

  const stackImageIds = await createImageIdsAndCacheMetaData({
    StudyInstanceUID: '1.2.840.113663.1500.1.248223208.1.1.20110323.105903.687',
    SeriesInstanceUID:
      '1.2.840.113663.1500.1.248223208.2.1.20110323.105903.687',
    SOPInstanceUID: '1.2.840.113663.1500.1.248223208.3.10.20110323.110423.875',
    wadoRsRoot: 'https://d14fa38qiwhyfd.cloudfront.net/dicomweb',
  });

  const volumeImageIds = await createImageIdsAndCacheMetaData({
    StudyInstanceUID:
      '1.3.6.1.4.1.14519.5.2.1.7009.2403.871108593056125491804754960339',
    SeriesInstanceUID:
      '1.3.6.1.4.1.14519.5.2.1.7009.2403.367700692008930469189923116409',
    wadoRsRoot: 'https://d14fa38qiwhyfd.cloudfront.net/dicomweb',
  });

  // Instantiate a rendering engine
  renderingEngine = new RenderingEngine(renderingEngineId);

  // Create the viewports
  const viewportInputArray = [
    {
      viewportId: viewportId1,
      type: ViewportType.STACK,
      element: element1,
    },
    {
      viewportId: viewportId2,
      type: ViewportType.ORTHOGRAPHIC,
      element: element2,
      defaultOptions: {
        orientation: Enums.OrientationAxis.SAGITTAL,
      },
    },
    {
      viewportId: viewportId3,
      type: ViewportType.STACK,
      element: element3,
    },
    {
      viewportId: viewportId4,
      type: ViewportType.ORTHOGRAPHIC,
      element: element4,
      defaultOptions: {
        orientation: Enums.OrientationAxis.SAGITTAL,
      },
    },
  ];
  renderingEngine.setViewports(viewportInputArray);

  stackLabelmapToolGroup.addViewport(viewportId1, renderingEngineId);
  volumeLabelmapToolGroup.addViewport(viewportId2, renderingEngineId);
  stackContourToolGroup.addViewport(viewportId3, renderingEngineId);
  volumeContourToolGroup.addViewport(viewportId4, renderingEngineId);

  _handleStackViewports(stackImageIds);
  _handleVolumeViewports(volumeImageIds, renderingEngine);

  // set the fillAlpha for the labelmap to 0
  segmentation.config.style.setStyle(
    {
      type: csToolsEnums.SegmentationRepresentations.Labelmap,
    },
    {
      fillAlpha: 0.05,
      activeSegmentOutlineWidthDelta: 3,
    }
  );
  segmentation.config.style.setStyle(
    {
      type: csToolsEnums.SegmentationRepresentations.Contour,
    },
    {
      fillAlpha: 0,
      activeSegmentOutlineWidthDelta: 3,
    }
  );
}

run();

async function _handleVolumeViewports(volumeImageIds, renderingEngine) {
  const volume = (await cornerstone.volumeLoader.createAndCacheVolume(
    volumeId,
    {
      imageIds: volumeImageIds,
    }
  )) as IStreamingImageVolume;

  // Set the volume to load
  await volume.load();

  // Set volumes on the viewports
  await cornerstone.setVolumesForViewports(
    renderingEngine,
    [{ volumeId, callback: setCtTransferFunctionForVolumeActor }],
    [viewportId2, viewportId4]
  );

  // Create a segmentation of the same resolution as the source data
  await cornerstone.volumeLoader.createAndCacheDerivedLabelmapVolume(volumeId, {
    volumeId: volumeSegLabelmapId,
  });

  fillVolumeLabelmapWithMockData({
    volumeId: volumeSegLabelmapId,
    cornerstone,
  });

  // Add the segmentations to state
  segmentation.addSegmentations([
    {
      segmentationId: volumeSegLabelmapId,
      representation: {
        // The type of segmentation
        type: csToolsEnums.SegmentationRepresentations.Labelmap,
        // The actual segmentation data, in the case of labelmap this is a
        // reference to the source volume of the segmentation.
        data: {
          volumeId: volumeSegLabelmapId,
        },
      },
    },
  ]);

  // Add the segmentation representation to the viewport
  segmentation.addSegmentationRepresentations(viewportId2, [
    {
      segmentationId: volumeSegLabelmapId,
      type: csToolsEnums.SegmentationRepresentations.Labelmap,
    },
  ]);

  segmentation.addSegmentations([
    {
      segmentationId: volumeSegContourId,
      representation: {
        type: csToolsEnums.SegmentationRepresentations.Contour,
      },
    },
  ]);

  // Add the segmentation representation to the viewport
  await segmentation.addSegmentationRepresentations(viewportId4, [
    {
      segmentationId: volumeSegContourId,
      type: csToolsEnums.SegmentationRepresentations.Contour,
    },
  ]);

  addMockContourSegmentation({
    segmentationId: volumeSegContourId,
    viewport: renderingEngine.getViewport(viewportId4),
    contours: [
      {
        segmentIndex: 1,
        radius: 75,
      },
      {
        segmentIndex: 2,
        radius: 75,
        centerOffset: [0, -150],
      },
    ],
  });
}

async function _handleStackViewports(stackImageIds: string[]) {
  const viewport1 = renderingEngine.getViewport(viewportId1);
  const viewport3 = renderingEngine.getViewport(viewportId3);

  const imageIdsArray = [stackImageIds[0]];

  const segImages = await imageLoader.createAndCacheDerivedLabelmapImages(
    imageIdsArray
  );

  const segmentationImageIds = segImages.map((it) => it.imageId);

  await viewport1.setStack(imageIdsArray, 0);
  await viewport3.setStack(imageIdsArray, 0);

  fillStackSegmentationWithMockData({
    imageIds: imageIdsArray,
    segmentationImageIds,
    cornerstone,
  });

  segmentation.addSegmentations([
    {
      segmentationId: stackSegLabelmapId,
      representation: {
        type: csToolsEnums.SegmentationRepresentations.Labelmap,
        data: {
          imageIds: segmentationImageIds,
        },
      },
    },
  ]);

  // Add the segmentation representation to the viewport
  await segmentation.addSegmentationRepresentations(viewportId1, [
    {
      segmentationId: stackSegLabelmapId,
      type: csToolsEnums.SegmentationRepresentations.Labelmap,
    },
  ]);

  segmentation.addSegmentations([
    {
      segmentationId: stackSegContourId,
      representation: {
        type: csToolsEnums.SegmentationRepresentations.Contour,
      },
    },
  ]);

  // Add the segmentation representation to the viewport
  await segmentation.addSegmentationRepresentations(viewportId3, [
    {
      segmentationId: stackSegContourId,
      type: csToolsEnums.SegmentationRepresentations.Contour,
    },
  ]);

  addMockContourSegmentation({
    segmentationId: stackSegContourId,
    viewport: renderingEngine.getViewport(viewportId3),
    contours: [
      {
        segmentIndex: 1,
        radius: 50,
        centerOffset: [50, 0],
      },
      {
        segmentIndex: 2,
        radius: 50,
        centerOffset: [-50, 0],
      },
    ],
  });

  setTimeout(() => {
    viewport1.setZoom(5);
    viewport3.setZoom(5);
    renderingEngine.render();
  }, 100);
}
