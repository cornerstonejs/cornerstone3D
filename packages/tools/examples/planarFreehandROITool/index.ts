import type { Types } from '@cornerstonejs/core';
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
  addFillOpacityDropdownToToolbar,
  addUShapeModeDropdownToToolbar,
  createInfoSection,
} from '../../../../utils/demo/helpers';
import * as cornerstoneTools from '@cornerstonejs/tools';

// This is for debugging purposes
console.warn(
  'Click on index.ts to open source code for this example --------->'
);

const {
  PlanarFreehandROITool,
  PanTool,
  StackScrollTool,
  ZoomTool,
  ToolGroupManager,
  Enums: csToolsEnums,
} = cornerstoneTools;

const { ViewportType } = Enums;
const { MouseBindings } = csToolsEnums;

// Define a unique id for the volume
const volumeName = 'CT_VOLUME_ID'; // Id of the volume less loader prefix
const volumeLoaderScheme = 'cornerstoneStreamingImageVolume'; // Loader id which defines which volume loader to use
const volumeId = `${volumeLoaderScheme}:${volumeName}`; // VolumeId with loader id + volume id
const renderingEngineId = 'myRenderingEngine';
const toolGroupId = 'STACK_TOOL_GROUP_ID';

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
  .closeNestedSection()
  .addInstruction('Open Contours')
  .openNestedSection()
  .addInstruction(
    'Hover over an end and you will see a handle appear, drag this handle to pull out the polyline further. You can join this handle back round to the other end if you wish to close the contour (say you made a mistake making an open contour).'
  )
  .addInstruction(
    'Drag the line and a preview of the edit will be displayed. Release the mouse to complete the edit. You can cross the original contour multiple times in one drag to do a complicated edit in one movement.'
  )
  .addInstruction(
    'If You drag the line past the end of the of the open contour, the edit will snap to make your edit the new end, and allow you to continue drawing.'
  )
  .closeNestedSection();

createInfoSection(content, {
  title:
    'Setting an open annotation to join the endpoints and draw the longest line from the midpoint to the contour (for horseshoe shaped contours, e.g. in Cardiac workflows) (In the future this should likely be pulled out to its own tool)',
})
  .addInstruction('Draw an open contour as a horseshow shape.')
  .addInstruction(
    'With the open contour selected, click the "Render selected open contour with joined ends and midpoint line" button.'
  )
  .addInstruction(
    'The two open ends will be drawn with a dotted line, and the midpoint of the line to the tip of the horseshoe shall be calculated and displayed.'
  );

addUShapeModeDropdownToToolbar({
  toolGroupId,
  toolNames: [PlanarFreehandROITool.toolName],
  renderingEngineId,
  viewportIds,
  getRenderingEngine,
});

addFillOpacityDropdownToToolbar({
  toolGroupId,
  toolNames: [PlanarFreehandROITool.toolName],
  renderingEngineId,
  viewportIds,
  getRenderingEngine,
});

let shouldInterpolate = false;
function addToggleInterpolationButton(toolGroup) {
  addButtonToToolbar({
    title: 'Toggle interpolation',
    onClick: () => {
      shouldInterpolate = !shouldInterpolate;

      toolGroup.setToolConfiguration(PlanarFreehandROITool.toolName, {
        interpolation: {
          enabled: shouldInterpolate,
        },
      });
    },
  });
}

function addSmoothButton(toolGroup) {
  addButtonToToolbar({
    title: 'Smooth',
    onClick: () => {
      const annotations = cornerstoneTools.annotation.state.getAllAnnotations();
      const renderingEngine = getRenderingEngine(renderingEngineId);
      annotations.forEach((annotation) => {
        cornerstoneTools.utilities.planarFreehandROITool.smoothAnnotation(
          <
            cornerstoneTools.Types.ToolSpecificAnnotationTypes.PlanarFreehandROIAnnotation
          >annotation,
          { loop: 5 }
        );
      });
      renderingEngine.renderViewports(viewportIds);
    },
  });
}

let shouldCalculateStats = false;
function addToggleCalculateStatsButton(toolGroup) {
  addButtonToToolbar({
    title: 'Toggle calculate stats',
    onClick: () => {
      shouldCalculateStats = !shouldCalculateStats;

      toolGroup.setToolConfiguration(PlanarFreehandROITool.toolName, {
        calculateStats: shouldCalculateStats,
      });
    },
  });
}
// ============================= //

/**
 * Runs the demo
 */
async function run() {
  // Init Cornerstone and related libraries
  await initDemo();

  // Add tools to Cornerstone3D
  cornerstoneTools.addTool(PlanarFreehandROITool);
  cornerstoneTools.addTool(PanTool);
  cornerstoneTools.addTool(StackScrollTool);
  cornerstoneTools.addTool(ZoomTool);

  // Define a tool group, which defines how mouse events map to tool commands for
  // Any viewport using the group
  const toolGroup = ToolGroupManager.createToolGroup(toolGroupId);

  // Add the tools to the tool group
  toolGroup.addTool(PlanarFreehandROITool.toolName, { cachedStats: true });
  toolGroup.addTool(PanTool.toolName);
  toolGroup.addTool(StackScrollTool.toolName);
  toolGroup.addTool(ZoomTool.toolName);

  // Set the initial state of the tools.
  toolGroup.setToolActive(PlanarFreehandROITool.toolName, {
    bindings: [
      {
        mouseButton: MouseBindings.Primary, // Left Click
      },
    ],
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
    ],
  });
  // As the Stack Scroll mouse wheel is a tool using the `mouseWheelCallback`
  // hook instead of mouse buttons, it does not need to assign any mouse button.
  toolGroup.setToolActive(StackScrollTool.toolName, {
    bindings: [{ mouseButton: MouseBindings.Wheel }],
  });

  // set up toggle interpolation tool button.
  addToggleInterpolationButton(toolGroup);
  addSmoothButton(toolGroup);

  // set up toggle calculate stats tool button.
  addToggleCalculateStatsButton(toolGroup);

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
}

run();
