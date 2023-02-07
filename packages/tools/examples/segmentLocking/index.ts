import {
  RenderingEngine,
  Types,
  Enums,
  setVolumesForViewports,
  volumeLoader,
} from '@cornerstonejs/core';
import {
  initDemo,
  createImageIdsAndCacheMetaData,
  setTitleAndDescription,
  addDropdownToToolbar,
  addToggleButtonToToolbar,
} from '../../../../utils/demo/helpers';
import * as cornerstoneTools from '@cornerstonejs/tools';

// This is for debugging purposes
console.warn(
  'Click on index.ts to open source code for this example --------->'
);

const {
  SegmentationDisplayTool,
  ToolGroupManager,
  Enums: csToolsEnums,
  segmentation,
  BrushTool,
  PanTool,
  ZoomTool,
  StackScrollMouseWheelTool,
} = cornerstoneTools;

const { MouseBindings } = csToolsEnums;
const { ViewportType } = Enums;

// Define a unique id for the volume
const volumeName = 'CT_VOLUME_ID'; // Id of the volume less loader prefix
const volumeLoaderScheme = 'cornerstoneStreamingImageVolume'; // Loader id which defines which volume loader to use
const volumeId = `${volumeLoaderScheme}:${volumeName}`; // VolumeId with loader id + volume id
const segmentationId = 'MY_SEGMENTATION_ID';
const toolGroupId = 'MY_TOOLGROUP_ID';

// ======== Set up page ======== //
setTitleAndDescription(
  'Segment Locking',
  'Here we demonstrate how a segment can be locked such that it cannot be edited by segmentation tools'
);

const size = '500px';
const content = document.getElementById('content');
const viewportGrid = document.createElement('div');

viewportGrid.style.display = 'flex';
viewportGrid.style.display = 'flex';
viewportGrid.style.flexDirection = 'row';

const element1 = document.createElement('div');
const element2 = document.createElement('div');
const element3 = document.createElement('div');
element1.style.width = size;
element1.style.height = size;
element2.style.width = size;
element2.style.height = size;
element3.style.width = size;
element3.style.height = size;

// Disable right click context menu so we can have right click tools
element1.oncontextmenu = (e) => e.preventDefault();
element2.oncontextmenu = (e) => e.preventDefault();
element3.oncontextmenu = (e) => e.preventDefault();

viewportGrid.appendChild(element1);
viewportGrid.appendChild(element2);
viewportGrid.appendChild(element3);

content.appendChild(viewportGrid);

const instructions = document.createElement('p');
instructions.innerText = `
  - Switch segment using the drop down
  - Lock segment 1 segment using the toggle.

  When locked, segment 1 cannot be overriden with segment 2.

  Left Click: Segmentation Brush
  Middle Click: Pan
  Right Click: Zoom
  Mouse wheel: Scroll Stack
  `;

content.append(instructions);

// ============================= //
addDropdownToToolbar({
  options: { values: ['1', '2'], defaultValue: '1' },
  onSelectedValueChange: (segmentIndex) => {
    segmentation.segmentIndex.setActiveSegmentIndex(
      segmentationId,
      Number(segmentIndex)
    );
  },
});

addToggleButtonToToolbar({
  title: 'Toggle Locked Segment 1',
  onClick: (toggle) => {
    segmentation.segmentLocking.setSegmentIndexLocked(
      segmentationId,
      1,
      toggle
    );
  },
  defaultToggle: false,
});

// ============================= //

async function addSegmentationsToState() {
  // Create a segmentation of the same resolution as the source data
  // using volumeLoader.createAndCacheDerivedVolume.
  await volumeLoader.createAndCacheDerivedVolume(volumeId, {
    volumeId: segmentationId,
  });

  // Add the segmentations to state
  segmentation.addSegmentations([
    {
      segmentationId,
      representation: {
        // The type of segmentation
        type: csToolsEnums.SegmentationRepresentations.Labelmap,
        // The actual segmentation data, in the case of labelmap this is a
        // reference to the source volume of the segmentation.
        data: {
          volumeId: segmentationId,
        },
      },
    },
  ]);
}

/**
 * Runs the demo
 */
async function run() {
  // Init Cornerstone and related libraries
  await initDemo();

  // Add tools to Cornerstone3D
  cornerstoneTools.addTool(PanTool);
  cornerstoneTools.addTool(ZoomTool);
  cornerstoneTools.addTool(StackScrollMouseWheelTool);
  cornerstoneTools.addTool(SegmentationDisplayTool);
  cornerstoneTools.addTool(BrushTool);

  // Define tool groups to add the segmentation display tool to
  const toolGroup = ToolGroupManager.createToolGroup(toolGroupId);

  // Manipulation Tools
  toolGroup.addTool(PanTool.toolName);
  toolGroup.addTool(ZoomTool.toolName);
  toolGroup.addTool(StackScrollMouseWheelTool.toolName);

  // Segmentation Tools
  toolGroup.addTool(SegmentationDisplayTool.toolName);
  toolGroup.addTool(BrushTool.toolName);
  toolGroup.setToolEnabled(SegmentationDisplayTool.toolName);

  toolGroup.setToolActive(BrushTool.toolName, {
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
    ],
  });
  // As the Stack Scroll mouse wheel is a tool using the `mouseWheelCallback`
  // hook instead of mouse buttons, it does not need to assign any mouse button.
  toolGroup.setToolActive(StackScrollMouseWheelTool.toolName);

  // Get Cornerstone imageIds for the source data and fetch metadata into RAM
  const imageIds = await createImageIdsAndCacheMetaData({
    StudyInstanceUID:
      '1.3.6.1.4.1.14519.5.2.1.7009.2403.334240657131972136850343327463',
    SeriesInstanceUID:
      '1.3.6.1.4.1.14519.5.2.1.7009.2403.226151125820845824875394858561',
    wadoRsRoot: 'https://d3t6nz73ql33tx.cloudfront.net/dicomweb',
  });

  // Define a volume in memory
  const volume = await volumeLoader.createAndCacheVolume(volumeId, {
    imageIds,
  });

  // Add some segmentations based on the source data volume
  await addSegmentationsToState();

  // Instantiate a rendering engine
  const renderingEngineId = 'myRenderingEngine';
  const renderingEngine = new RenderingEngine(renderingEngineId);

  // Create the viewports
  const viewportId1 = 'CT_AXIAL';
  const viewportId2 = 'CT_SAGITTAL';
  const viewportId3 = 'CT_CORONAL';

  const viewportInputArray = [
    {
      viewportId: viewportId1,
      type: ViewportType.ORTHOGRAPHIC,
      element: element1,
      defaultOptions: {
        orientation: Enums.OrientationAxis.AXIAL,
        background: <Types.Point3>[0, 0, 0],
      },
    },
    {
      viewportId: viewportId2,
      type: ViewportType.ORTHOGRAPHIC,
      element: element2,
      defaultOptions: {
        orientation: Enums.OrientationAxis.SAGITTAL,
        background: <Types.Point3>[0, 0, 0],
      },
    },
    {
      viewportId: viewportId3,
      type: ViewportType.ORTHOGRAPHIC,
      element: element3,
      defaultOptions: {
        orientation: Enums.OrientationAxis.CORONAL,
        background: <Types.Point3>[0, 0, 0],
      },
    },
  ];

  renderingEngine.setViewports(viewportInputArray);

  toolGroup.addViewport(viewportId1, renderingEngineId);
  toolGroup.addViewport(viewportId2, renderingEngineId);
  toolGroup.addViewport(viewportId3, renderingEngineId);

  // Set the volume to load
  volume.load();

  // Set volumes on the viewports
  await setVolumesForViewports(
    renderingEngine,
    [{ volumeId }],
    [viewportId1, viewportId2, viewportId3]
  );

  // // Add the segmentation representation to the toolgroup
  await segmentation.addSegmentationRepresentations(toolGroupId, [
    {
      segmentationId,
      type: csToolsEnums.SegmentationRepresentations.Labelmap,
    },
  ]);

  // Render the image
  renderingEngine.renderViewports([viewportId1, viewportId2, viewportId3]);
}

run();
