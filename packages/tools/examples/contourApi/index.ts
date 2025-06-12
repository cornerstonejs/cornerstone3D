import type { Types } from '@cornerstonejs/core';
import {
  addTool,
  PlanarFreehandContourSegmentationTool,
  PanTool,
  StackScrollTool,
  ZoomTool,
  ToolGroupManager,
  Enums as csToolsEnums,
  segmentation,
} from '@cornerstonejs/tools';
import {
  RenderingEngine,
  Enums,
  volumeLoader,
  getRenderingEngine,
} from '@cornerstonejs/core';
import {
  initDemo,
  createImageIdsAndCacheMetaData,
  setTitleAndDescription,
  addButtonToToolbar,
  contourSegmentationToolBindings,
  createInfoSection,
  addSegmentIndexDropdown,
} from '../../../../utils/demo/helpers';

const segmentationId = `SEGMENTATION_ID`;

// This is for debugging purposes
console.warn(
  'Click on index.ts to open source code for this example --------->'
);

const { ViewportType } = Enums;
const { MouseBindings } = csToolsEnums;

// Define a unique id for the volume
const volumeName = 'CT_VOLUME_ID'; // Id of the volume less loader prefix
const volumeLoaderScheme = 'cornerstoneStreamingImageVolume'; // Loader id which defines which volume loader to use
const volumeId = `${volumeLoaderScheme}:${volumeName}`; // VolumeId with loader id + volume id
const renderingEngineId = 'myRenderingEngine';

const viewportIds = ['CT_STACK', 'CT_VOLUME_SAGITTAL'];

// ======== Set up page ======== //
setTitleAndDescription(
  'Planar Freehand Annotation Tool',
  'Here we demonstrate how to use the Planar Freehand Annotation Tool to draw 2D open and closed ROIs'
);

const size = '500px';
const content = document.getElementById('content');
const viewportGrid = document.createElement('div');

viewportGrid.style.display = 'flex';
viewportGrid.style.display = 'flex';
viewportGrid.style.flexDirection = 'row';

const element1 = document.createElement('div');
const element2 = document.createElement('div');
element1.style.width = size;
element1.style.height = size;
element2.style.width = size;
element2.style.height = size;

// Disable right click context menu so we can have right click tool
element1.oncontextmenu = (e) => e.preventDefault();
element2.oncontextmenu = (e) => e.preventDefault();

viewportGrid.appendChild(element1);
viewportGrid.appendChild(element2);

content.appendChild(viewportGrid);

createInfoSection(content, { title: 'Drawing' })
  .addInstruction('Left click and drag to draw a contour')
  .openNestedSection()
  .addInstruction(
    'If you join the contour together it will be closed, otherwise releasing the mouse will create an open contour (freehand line)'
  );

createInfoSection(content, { title: 'Editing' })
  .addInstruction(
    'Left click and drag on the line of an existing contour to edit it'
  )
  .openNestedSection()
  .addInstruction('Closed Contours')
  .openNestedSection()
  .addInstruction(
    'Drag the line and a preview of the edit will be displayed. Release the mouse to complete the edit. You can cross the original contour multiple times in one drag to do a complicated edit in one movement.'
  )
  .closeNestedSection();

createInfoSection(content, { title: 'Contour Utilities' })
  .addInstruction(
    'Find Contour Holes: Analyzes contours to detect holes within them. Results are logged to console.'
  )
  .addInstruction(
    'Smooth Polylines: Smooth contours by choosing control points in the contour and applying a spline interpolation on them. Note: it alters the contour shape if there is few points'
  )
  .addInstruction(
    'Remove Small Islands: Filters out closed contours smaller than area threshold (3 cm2 units). Only affects closed contours, preserves open polylines.'
  )
  .addInstruction(
    'Decimate Polylines: Simplifies polylines by removing points using Ramer-Douglas-Peucker algorithm with epsilon tolerance of 2.0 units. Shows reduction percentage.'
  );

addSegmentIndexDropdown(segmentationId);
addButtonToToolbar({
  title: 'Remove Contour Holes',
  onClick: () => {
    const segmentIndex =
      segmentation.segmentIndex.getActiveSegmentIndex(segmentationId);
    segmentation.utilities.removeContourHoles(segmentationId, segmentIndex);
    const renderingEngine = getRenderingEngine(renderingEngineId);
    renderingEngine.render();
  },
});

addButtonToToolbar({
  title: 'Remove Small Islands',
  onClick: () => {
    const segmentIndex =
      segmentation.segmentIndex.getActiveSegmentIndex(segmentationId);
    segmentation.utilities.removeContourIslands(segmentationId, segmentIndex, {
      threshold: 10,
    });
    const renderingEngine = getRenderingEngine(renderingEngineId);
    renderingEngine.render();
  },
});

addButtonToToolbar({
  title: 'Smooth Polylines',
  onClick: () => {
    const segmentIndex =
      segmentation.segmentIndex.getActiveSegmentIndex(segmentationId);
    segmentation.utilities.smoothContours(segmentationId, segmentIndex);
    const renderingEngine = getRenderingEngine(renderingEngineId);
    renderingEngine.render();
  },
});

addButtonToToolbar({
  title: 'Decimate Polylines',
  onClick: () => {
    const segmentIndex =
      segmentation.segmentIndex.getActiveSegmentIndex(segmentationId);
    segmentation.utilities.decimateContours(segmentationId, segmentIndex);
    const renderingEngine = getRenderingEngine(renderingEngineId);
    renderingEngine.render();
  },
});
// ============================= //

const toolGroupId = 'STACK_TOOL_GROUP_ID';

/**
 * Runs the demo
 */
async function run() {
  // Init Cornerstone and related libraries
  await initDemo();

  // Add tools to Cornerstone3D
  addTool(PlanarFreehandContourSegmentationTool);
  addTool(PanTool);
  addTool(StackScrollTool);
  addTool(ZoomTool);

  // Define a tool group, which defines how mouse events map to tool commands for
  // Any viewport using the group
  const toolGroup = ToolGroupManager.createToolGroup(toolGroupId);

  // Add the tools to the tool group
  toolGroup.addTool(PlanarFreehandContourSegmentationTool.toolName);
  toolGroup.addTool(PanTool.toolName);
  toolGroup.addTool(StackScrollTool.toolName);
  toolGroup.addTool(ZoomTool.toolName);

  toolGroup.setToolActive(PlanarFreehandContourSegmentationTool.toolName, {
    bindings: contourSegmentationToolBindings,
  });

  // Set the initial state of the tools.
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
    ],
  });
  // As the Stack Scroll mouse wheel is a tool using the `mouseWheelCallback`
  // hook instead of mouse buttons, it does not need to assign any mouse button.
  toolGroup.setToolActive(StackScrollTool.toolName, {
    bindings: [{ mouseButton: MouseBindings.Wheel }],
  });

  // Get Cornerstone imageIds and fetch metadata into RAM
  const stackImageIds = await createImageIdsAndCacheMetaData({
    StudyInstanceUID:
      '1.3.6.1.4.1.14519.5.2.1.7009.2403.334240657131972136850343327463',
    SeriesInstanceUID:
      '1.3.6.1.4.1.14519.5.2.1.7009.2403.226151125820845824875394858561',
    wadoRsRoot: 'https://d14fa38qiwhyfd.cloudfront.net/dicomweb',
  });

  // Define a stack containing a single image
  const smallStackImageIds = [stackImageIds[0], stackImageIds[1]];

  const volumeImageIds = await createImageIdsAndCacheMetaData({
    StudyInstanceUID:
      '1.3.6.1.4.1.14519.5.2.1.7009.2403.334240657131972136850343327463',
    SeriesInstanceUID:
      '1.3.6.1.4.1.14519.5.2.1.7009.2403.226151125820845824875394858561',
    wadoRsRoot: 'https://d14fa38qiwhyfd.cloudfront.net/dicomweb',
  });

  // Create a stack and a volume viewport
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
      type: ViewportType.ORTHOGRAPHIC,
      element: element2,
      defaultOptions: {
        orientation: Enums.OrientationAxis.SAGITTAL,
        background: <Types.Point3>[0.2, 0, 0.2],
      },
    },
  ];

  // Instantiate a rendering engine
  const renderingEngine = new RenderingEngine(renderingEngineId);

  renderingEngine.setViewports(viewportInputArray);

  // Set the tool group on the viewport
  viewportIds.forEach((viewportId) =>
    toolGroup.addViewport(viewportId, renderingEngineId)
  );

  // Define a volume in memory
  const volume = await volumeLoader.createAndCacheVolume(volumeId, {
    imageIds: volumeImageIds,
  });

  // Get the viewports that were just created
  const stackViewport = <Types.IStackViewport>(
    renderingEngine.getViewport(viewportIds[0])
  );
  const volumeViewport = <Types.IVolumeViewport>(
    renderingEngine.getViewport(viewportIds[1])
  );

  // Set the stack on the viewport
  stackViewport.setStack(smallStackImageIds);

  // Set the volume to load
  volume.load();

  // Set the volume on the viewport
  volumeViewport.setVolumes([{ volumeId }]);

  // Render the image
  renderingEngine.renderViewports(viewportIds);
  // Add a segmentation that will contains the contour annotations
  segmentation.addSegmentations([
    {
      segmentationId,
      representation: {
        type: csToolsEnums.SegmentationRepresentations.Contour,
      },
    },
  ]);

  // Create a segmentation representation associated to the viewportId
  await segmentation.addSegmentationRepresentations(viewportIds[0], [
    {
      segmentationId,
      type: csToolsEnums.SegmentationRepresentations.Contour,
    },
  ]);
  await segmentation.addSegmentationRepresentations(viewportIds[1], [
    {
      segmentationId,
      type: csToolsEnums.SegmentationRepresentations.Contour,
    },
  ]);

  segmentation.segmentIndex.setActiveSegmentIndex(segmentationId, 1);
}

run();
