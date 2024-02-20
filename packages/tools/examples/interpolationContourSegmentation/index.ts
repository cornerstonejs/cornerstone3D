import {
  RenderingEngine,
  Types,
  Enums,
  volumeLoader,
} from '@cornerstonejs/core';
import {
  initDemo,
  createImageIdsAndCacheMetaData,
  setTitleAndDescription,
  addButtonToToolbar,
  addDropdownToToolbar,
  addManipulationBindings,
} from '../../../../utils/demo/helpers';
import * as cornerstoneTools from '@cornerstonejs/tools';

// This is for debugging purposes
console.warn(
  'Click on index.ts to open source code for this example --------->'
);

const {
  PlanarFreehandContourSegmentationTool,
  PlanarFreehandROITool,
  SplineContourSegmentationTool,
  SplineROITool,
  LivewireContourSegmentationTool,
  LivewireContourTool,
  SegmentationDisplayTool,
  ToolGroupManager,
  Enums: csToolsEnums,
  segmentation,
} = cornerstoneTools;

const { ViewportType, InterpolationType } = Enums;
const { MouseBindings, KeyboardBindings } = csToolsEnums;

// Define a unique id for the volume
const volumeName = 'CT_VOLUME_ID'; // Id of the volume less loader prefix
const volumeLoaderScheme = 'cornerstoneStreamingImageVolume'; // Loader id which defines which volume loader to use
const volumeId = `${volumeLoaderScheme}:${volumeName}`; // VolumeId with loader id + volume id
const renderingEngineId = 'myRenderingEngine';
let renderingEngine;
const viewportIds = ['CT_STACK', 'CT_VOLUME_SAGITTAL'];
const viewports = [];
const segmentationIdStack = `SEGMENTATION_ID_STACK`;
const segmentationIdVolume = `SEGMENTATION_ID_VOLUME`;
const segmentationIds = [segmentationIdStack, segmentationIdVolume];
let frameOfReferenceUID;

const interpolationTools = new Map<string, any>();
const actions = {
  acceptCurrent: {
    method: acceptCurrent,
    bindings: [
      {
        key: 'Enter',
      },
    ],
  },
};

const interpolation = {
  enabled: true,
  showInterpolationPolyline: true,
};

const configuration = {
  interpolation,
  actions,
};

interpolationTools.set('SplineInterpolation', {
  baseTool: SplineContourSegmentationTool.toolName,
  configuration,
});
interpolationTools.set('FreeformInterpolation', {
  baseTool: PlanarFreehandContourSegmentationTool.toolName,
  configuration,
  passive: true,
});
interpolationTools.set('LivewireInterpolation', {
  baseTool: LivewireContourSegmentationTool.toolName,
  configuration,
});
interpolationTools.set('LivewireInterpolationNearest3', {
  baseTool: LivewireContourSegmentationTool.toolName,
  configuration: {
    ...interpolation,
    interpolation: { ...interpolation, nearestEdge: 3 },
  },
});
interpolationTools.set('LivewireInterpolationNearest3RepeatInterpolation', {
  baseTool: LivewireContourSegmentationTool.toolName,
  configuration: {
    ...configuration,
    interpolation: { enabled: true, nearestEdge: 3, repeatInterpolation: true },
  },
});
interpolationTools.set(PlanarFreehandContourSegmentationTool.toolName, {
  passive: true,
});

const interpolationToolName = [...interpolationTools.keys()][0];

const segmentIndexes = [1, 2, 3, 4, 5];

// ======== Set up page ======== //
setTitleAndDescription(
  'Contour Freehand Annotation Tool',
  'Here we demonstrate how to use the Contour Freehand Annotation Tool to draw 2D closed ROIs'
);

const size = '800px';
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

addDropdownToToolbar({
  labelText: 'Segment Index',
  options: { values: segmentIndexes, defaultValue: segmentIndexes[0] },
  onSelectedValueChange: (nameAsStringOrNumber) => {
    updateActiveSegmentIndex(Number(nameAsStringOrNumber));
  },
});

const toolsNames = [
  ...interpolationTools.keys(),
  PlanarFreehandROITool.toolName,
  SplineContourSegmentationTool.toolName,
  SplineROITool.toolName,
  LivewireContourSegmentationTool.toolName,
  LivewireContourTool.toolName,
];
let selectedToolName = toolsNames[0];

addDropdownToToolbar({
  options: { values: toolsNames, defaultValue: selectedToolName },
  onSelectedValueChange: (newSelectedToolNameAsStringOrNumber) => {
    const newSelectedToolName = String(newSelectedToolNameAsStringOrNumber);
    for (const toolGroupId of toolGroupIds) {
      const toolGroup = ToolGroupManager.getToolGroup(toolGroupId);

      // Set the new tool active
      toolGroup.setToolActive(newSelectedToolName, {
        bindings: [
          {
            mouseButton: MouseBindings.Primary, // Left Click
          },
          {
            mouseButton: MouseBindings.Primary, // Shift + Left Click
            modifierKey: KeyboardBindings.Shift,
          },
        ],
      });

      // Set the old tool passive
      toolGroup.setToolPassive(selectedToolName, { removeAllBindings: true });
    }
    selectedToolName = <string>newSelectedToolName;
  },
});

addButtonToToolbar({
  title: 'Accept All',
  onClick: () => {
    for (const segmentationId of segmentationIds) {
      cornerstoneTools.utilities.contours.acceptAutogeneratedInterpolations(
        frameOfReferenceUID,
        {
          segmentIndex:
            segmentation.segmentIndex.getActiveSegmentIndex(segmentationId),
          segmentationId,
          // Could also specify only for the active tool, but that doesn't seem useful here.
        }
      );
    }
    renderingEngine.render();
  },
});

function acceptCurrent() {
  viewports.forEach((viewport) => {
    for (const segmentationId of segmentationIds) {
      cornerstoneTools.utilities.contours.acceptAutogeneratedInterpolations(
        viewport.element,
        {
          segmentIndex:
            segmentation.segmentIndex.getActiveSegmentIndex(segmentationId),
          segmentationId: segmentationIdStack,
          sliceIndex: viewport.getCurrentImageIdIndex(),
        }
      );
    }
  });

  renderingEngine.render();
}

addButtonToToolbar({
  title: 'Accept Current',
  onClick: acceptCurrent,
});

const instructions = document.createElement('p');
instructions.innerText = `
Drawing:

- Left click and drag to draw a contour.
- The default label will be assigned or you can select any label from label list (dropdown).
- Draw a contour in one slice and move to another slice (skip some slice in between) and draw contour there. After drawing the second contour, the interpolated contours will be created in intermediate slices.
- To create the interpolated contour there should be at least 1 or more slices in between manually drawn contours and the contours should be assigned with same label.
- Interpolated contours will not be created if more than one contour with same label is on a single slice.

--- Example:
-- 1) draw the contour in slice 1
-- 2) draw another contour in slice 5 with same label drawn in slice 1.
-- 3) check interpolated contours are created in intermediate slices.

Editing:
- Left click and drag on the line of an existing contour to edit it.
- Check related contours are adjusted based on the edited contour. If you are editing the interpolated contour then that contour will be considered as manually drawn.

Deleting:
- When manually drawn contour is deleted, then it will delete other interpolated contours connected to this contour.
- If the deleted the contour is in between two slices having manually drawn contours with same label, interpolated contours will be regenerated to connect those contours.
`;

content.append(instructions);

let shouldInterpolate = false;
function addToggleInterpolationButton(toolGroupIds) {
  addButtonToToolbar({
    title: 'Toggle interpolation',
    onClick: () => {
      shouldInterpolate = !shouldInterpolate;

      toolGroupIds.forEach((toolGroupId) => {
        const toolGroup = ToolGroupManager.getToolGroup(toolGroupId);
        toolGroup.setToolConfiguration(interpolationToolName, {
          interpolation: {
            enabled: shouldInterpolate,
          },
        });
      });
    },
  });
}

const toolGroupIds = ['STACK_TOOL_GROUP_ID', 'VOLUME_TOOL_GROUP_ID'];

/** Adds the bindings for the tool group  */
function addBindings(toolGroupId) {
  const toolGroup = ToolGroupManager.createToolGroup(toolGroupId);
  addManipulationBindings(toolGroup);

  // Add the tools to the tool group
  toolGroup.addTool(SegmentationDisplayTool.toolName);
  toolGroup.setToolEnabled(SegmentationDisplayTool.toolName);

  for (const [toolName, config] of interpolationTools.entries()) {
    if (config.baseTool) {
      toolGroup.addToolInstance(
        toolName,
        config.baseTool,
        config.configuration
      );
    } else {
      toolGroup.addTool(toolName, config.configuration);
    }
    if (config.passive) {
      // This can be applied during add/remove contours
      toolGroup.setToolPassive(toolName);
    }
  }
  toolGroup.addTool(PlanarFreehandROITool.toolName);
  toolGroup.addTool(SplineContourSegmentationTool.toolName);
  toolGroup.addTool(SplineROITool.toolName);
  toolGroup.addTool(LivewireContourSegmentationTool.toolName);
  toolGroup.addTool(LivewireContourTool.toolName);

  // Set the initial state of the tools.
  toolGroup.setToolActive(interpolationToolName, {
    bindings: [
      {
        mouseButton: MouseBindings.Primary, // Left Click
      },
      {
        mouseButton: MouseBindings.Primary, // Shift + Left Click
        modifierKey: KeyboardBindings.Shift,
      },
    ],
  });
}
/**
 * Runs the demo
 */
async function run() {
  // Init Cornerstone and related libraries
  await initDemo();

  // Add tools to Cornerstone3D
  cornerstoneTools.addTool(PlanarFreehandContourSegmentationTool);
  cornerstoneTools.addTool(PlanarFreehandROITool);
  cornerstoneTools.addTool(SplineContourSegmentationTool);
  cornerstoneTools.addTool(SplineROITool);
  cornerstoneTools.addTool(LivewireContourSegmentationTool);
  cornerstoneTools.addTool(LivewireContourTool);

  cornerstoneTools.addTool(SegmentationDisplayTool);

  // Define a tool group, which defines how mouse events map to tool commands for
  // Any viewport using the group
  addBindings(toolGroupIds[0]);
  addBindings(toolGroupIds[1]);
  // set up toggle interpolation tool button.
  addToggleInterpolationButton(toolGroupIds);

  // Get Cornerstone imageIds and fetch metadata into RAM
  const stackImageIds = await createImageIdsAndCacheMetaData({
    StudyInstanceUID:
      '1.3.6.1.4.1.14519.5.2.1.7009.2403.334240657131972136850343327463',
    SeriesInstanceUID:
      '1.3.6.1.4.1.14519.5.2.1.7009.2403.226151125820845824875394858561',
    wadoRsRoot: 'https://d3t6nz73ql33tx.cloudfront.net/dicomweb',
  });

  const volumeImageIds = await createImageIdsAndCacheMetaData({
    StudyInstanceUID:
      '1.3.6.1.4.1.14519.5.2.1.7009.2403.334240657131972136850343327463',
    SeriesInstanceUID:
      '1.3.6.1.4.1.14519.5.2.1.7009.2403.226151125820845824875394858561',
    wadoRsRoot: 'https://d3t6nz73ql33tx.cloudfront.net/dicomweb',
  });

  // Instantiate a rendering engine
  renderingEngine = new RenderingEngine(renderingEngineId);

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

  renderingEngine.setViewports(viewportInputArray);

  // Set the tool group on the viewport
  viewportIds.forEach((viewportId, index) => {
    console.log(
      'Setting tool group/viewport id',
      index,
      viewportId,
      toolGroupIds[index]
    );
    ToolGroupManager.getToolGroup(toolGroupIds[index]).addViewport(
      viewportId,
      renderingEngineId
    );
  });

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
  await stackViewport.setStack(stackImageIds);
  viewports.push(stackViewport);
  stackViewport.setDisplayArea({
    imageArea: [0.9, 0.9],
    storeAsInitialCamera: true,
  });
  stackViewport.setProperties({ interpolationType: InterpolationType.NEAREST });

  // Set the volume to load
  volume.load();

  // Set the volume on the viewport
  volumeViewport.setVolumes([{ volumeId }]);
  viewports.push(volumeViewport);

  // Render the image
  renderingEngine.renderViewports(viewportIds);

  // Add a segmentation that will contains the contour annotations
  let index = 0;
  for (const segmentationId of segmentationIds) {
    segmentation.addSegmentations([
      {
        segmentationId,
        representation: {
          type: csToolsEnums.SegmentationRepresentations.Contour,
        },
      },
    ]);
    // Create a segmentation representation associated to the toolGroupId
    // Add the segmentation representation to the toolgroup
    await segmentation.addSegmentationRepresentations(toolGroupIds[index++], [
      {
        segmentationId,
        type: csToolsEnums.SegmentationRepresentations.Contour,
      },
    ]);
  }

  frameOfReferenceUID = volumeViewport.getFrameOfReferenceUID();
}

function updateActiveSegmentIndex(segmentIndex: number): void {
  for (const segmentationId of segmentationIds) {
    segmentation.segmentIndex.setActiveSegmentIndex(
      segmentationId,
      segmentIndex
    );
  }
}

run();
