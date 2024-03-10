import { Enums, RenderingEngine } from '@cornerstonejs/core';
import * as cornerstone from '@cornerstonejs/core';
import * as cornerstoneTools from '@cornerstonejs/tools';
import {
  addManipulationBindings,
  createImageIdsAndCacheMetaData,
  initDemo,
  setCtTransferFunctionForVolumeActor,
  setTitleAndDescription,
} from '../../../../utils/demo/helpers';
import { addMockContourSegmentation } from '../../../../utils/test/testUtils';

// This is for debugging purposes
console.warn(
  'Click on index.ts to open source code for this example --------->'
);

const {
  ToolGroupManager,
  SegmentationDisplayTool,
  Enums: csToolsEnums,
  SegmentSelectTool,
  segmentation,
  PlanarFreehandContourSegmentationTool,
} = cornerstoneTools;

const { MouseBindings } = csToolsEnums;
const { ViewportType } = Enums;

// Define a unique id for the volume
let renderingEngine;
const volumeId = 'myVolume';
const renderingEngineId = 'myRenderingEngine';

// ======== Set up page ======== //
setTitleAndDescription(
  'Contour Segmentation Configuration',
  'Here, we demonstrate how you can customize the appearance of one contour segmentation in two different toolGroups. As you see, the same segmentation is able to appear differently in different toolGroups. As you can see the left viewport has a dashed and thicker line for the same contour segmentation.'
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
for (let i = 1; i <= 2; i++) {
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

const [element1, element2] = elements;

viewportGrid.appendChild(row1);
viewportGrid.appendChild(row2);

content.appendChild(viewportGrid);

const stackSegContourToolGroupId = 'TOOL_GROUP_STACK_CONTOUR';
const volumeSegContourToolGroupId = 'TOOL_GROUP_VOLUME_CONTOUR';

const viewportId1 = 'viewport1';
const viewportId2 = 'viewport2';

// ============================= //

cornerstoneTools.addTool(SegmentationDisplayTool);
cornerstoneTools.addTool(SegmentSelectTool);
cornerstoneTools.addTool(PlanarFreehandContourSegmentationTool);

function setupTools(toolGroupId, isContour = false) {
  // Define a tool group, which defines how mouse events map to tool commands for
  // Any viewport using the group
  const toolGroup = ToolGroupManager.createToolGroup(toolGroupId);

  if (isContour) {
    toolGroup.addTool(PlanarFreehandContourSegmentationTool.toolName);
  }

  addManipulationBindings(toolGroup);

  // Segmentation Tools
  toolGroup.addTool(SegmentationDisplayTool.toolName);
  toolGroup.addTool(SegmentSelectTool.toolName);

  toolGroup.setToolEnabled(SegmentationDisplayTool.toolName);
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

  const stackLabelmapToolGroup = setupTools(stackSegContourToolGroupId, true);
  const volumeLabelmapToolGroup = setupTools(volumeSegContourToolGroupId, true);

  const wadoRsRoot = 'https://d3t6nz73ql33tx.cloudfront.net/dicomweb';
  const StudyInstanceUID =
    '1.3.6.1.4.1.14519.5.2.1.7009.2403.334240657131972136850343327463';
  const volumeImageIds = await createImageIdsAndCacheMetaData({
    StudyInstanceUID,
    SeriesInstanceUID:
      '1.3.6.1.4.1.14519.5.2.1.7009.2403.226151125820845824875394858561',
    wadoRsRoot,
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
    },
  ];
  renderingEngine.setViewports(viewportInputArray);

  stackLabelmapToolGroup.addViewport(viewportId1, renderingEngineId);
  volumeLabelmapToolGroup.addViewport(viewportId2, renderingEngineId);

  // _handleStackViewports(volumeImageIds);
  // _handleVolumeViewports(volumeImageIds, renderingEngine);
  const volume = await cornerstone.volumeLoader.createAndCacheVolume(volumeId, {
    imageIds: volumeImageIds,
  });

  // Set the volume to load
  volume.load();

  // Set volumes on the viewports
  await cornerstone.setVolumesForViewports(
    renderingEngine,
    [{ volumeId, callback: setCtTransferFunctionForVolumeActor }],
    [viewportId2]
  );

  const viewport1 = renderingEngine.getViewport(viewportId1);

  await viewport1.setStack(volumeImageIds, 67);
  cornerstoneTools.utilities.stackContextPrefetch.enable(viewport1.element);

  const segmentationId = 'contour_segmentation';

  await segmentation.addSegmentations([
    {
      segmentationId,
      representation: {
        type: csToolsEnums.SegmentationRepresentations.Contour,
      },
    },
  ]);

  addMockContourSegmentation({
    segmentationId,
    viewport: renderingEngine.getViewport(viewportId1),
    contours: [
      {
        segmentIndex: 1,
        radius: 100,
      },
    ],
  });

  // Add the segmentation representation to the toolgroup
  await segmentation.addSegmentationRepresentations(
    stackSegContourToolGroupId,
    [
      {
        segmentationId,
        type: csToolsEnums.SegmentationRepresentations.Contour,
      },
    ]
  );
  await segmentation.addSegmentationRepresentations(
    volumeSegContourToolGroupId,
    [
      {
        segmentationId,
        type: csToolsEnums.SegmentationRepresentations.Contour,
      },
    ]
  );

  segmentation.config.setToolGroupSpecificConfig(stackSegContourToolGroupId, {
    renderInactiveSegmentations: true,
    representations: {
      CONTOUR: {
        outlineWidthActive: 5,
        outlineDashActive: '10, 10',
      },
    },
  });

  renderingEngine.render();
}

run();
