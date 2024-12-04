import type { Types } from '@cornerstonejs/core';
import {
  RenderingEngine,
  Enums,
  volumeLoader,
  setVolumesForViewports,
  cache,
} from '@cornerstonejs/core';
import {
  initDemo,
  createImageIdsAndCacheMetaData,
  setTitleAndDescription,
  createInfoSection,
  addManipulationBindings,
  addButtonToToolbar,
} from '../../../../utils/demo/helpers';
import * as cornerstoneTools from '@cornerstonejs/tools';

// This is for debugging purposes
console.warn(
  'Click on index.ts to open source code for this example --------->'
);

const DEFAULT_SEGMENT_CONFIG = {
  fillAlpha: 0.1,
  outlineOpacity: 1,
  outlineWidthActive: 3,
};

const {
  WholeBodySegmentTool,
  segmentation,
  ToolGroupManager,
  Enums: csToolsEnums,
} = cornerstoneTools;

const { ViewportType } = Enums;
const { MouseBindings } = csToolsEnums;
const volumeName = 'PT_VOLUME_ID'; // Id of the volume less loader prefix
const volumeLoaderScheme = 'cornerstoneStreamingImageVolume'; // Loader id which defines which volume loader to use
const volumeId = `${volumeLoaderScheme}:${volumeName}`; // VolumeId with loader id + volume id
const renderingEngineId = 'myRenderingEngine';
const viewportIdAxial = 'CT_VOLUME_AXIAL';
const viewportIdCoronal = 'CT_VOLUME_CORONAL';
const viewportIdSagittal = 'CT_VOLUME_SAGITTAL';
const segmentationId = 'MY_SEGMENTATION_ID';
const toolGroupId = 'STACK_TOOL_GROUP_ID';

// ======== Set up page ======== //
setTitleAndDescription(
  'Whole Body Segment Tool',
  'Demonstrates how to segment the whole body of a region selected by the user that is processed in the gpu (grow cut algorithm)'
);

const viewportGrid = document.createElement('div');

viewportGrid.style.display = 'grid';
viewportGrid.style.gridTemplateColumns = `repeat(3, 33%)`;

const content = document.getElementById('content');

content.appendChild(viewportGrid);

// prettier-ignore
createInfoSection(content)
  .addInstruction('Click on any viewport and drag up/down to select a region of the image')
  .addInstruction('Wait for a few seconds to get the whole-body segmented')

const elementAxial = document.createElement('div');
const elementCoronal = document.createElement('div');
const elementSagittal = document.createElement('div');

// Disable right click context menu so we can have right click tools
elementAxial.oncontextmenu = (e) => e.preventDefault();
elementCoronal.oncontextmenu = (e) => e.preventDefault();
elementSagittal.oncontextmenu = (e) => e.preventDefault();

elementAxial.style.height = '500px';
elementCoronal.style.height = '500px';
elementSagittal.style.height = '500px';

viewportGrid.appendChild(elementAxial);
viewportGrid.appendChild(elementCoronal);
viewportGrid.appendChild(elementSagittal);

const info = document.createElement('div');
content.appendChild(info);

// ==[ Toolbar ]================================================================

addButtonToToolbar({
  title: 'Clear segmentation',
  onClick: async () => {
    const labelmapVolume = cache.getVolume(segmentationId);
    labelmapVolume.voxelManager.clear();

    segmentation.triggerSegmentationEvents.triggerSegmentationDataModified(
      segmentationId
    );
  },
});

// =============================================================================

async function addSegmentationsToState() {
  // Create a segmentation of the same resolution as the source data
  volumeLoader.createAndCacheDerivedLabelmapVolume(volumeId, {
    volumeId: segmentationId,
  });

  // Add the segmentations to state
  segmentation.addSegmentations([
    {
      segmentationId,
      representation: {
        type: csToolsEnums.SegmentationRepresentations.Labelmap,
        data: {
          volumeId: segmentationId,
          referencedVolumeId: volumeId,
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
  cornerstoneTools.addTool(WholeBodySegmentTool);

  // Define a tool group, which defines how mouse events map to tool commands for
  // Any viewport using the group
  const toolGroup = ToolGroupManager.createToolGroup(toolGroupId);

  // Add the tools to the tool group
  toolGroup.addTool(WholeBodySegmentTool.toolName);

  // Set the initial state of the tools, here we set one tool active on left click.
  // This means left click will draw that tool.
  toolGroup.setToolActive(WholeBodySegmentTool.toolName, {
    bindings: [
      {
        mouseButton: MouseBindings.Primary, // Left Click
      },
    ],
  });

  addManipulationBindings(toolGroup);

  // Get Cornerstone imageIds and fetch metadata into RAM
  const imageIds = await createImageIdsAndCacheMetaData({
    StudyInstanceUID:
      '1.3.6.1.4.1.14519.5.2.1.7009.2403.334240657131972136850343327463',
    SeriesInstanceUID:
      '1.3.6.1.4.1.14519.5.2.1.7009.2403.226151125820845824875394858561',
    wadoRsRoot: 'https://d33do7qe4w26qo.cloudfront.net/dicomweb',
  });

  // Define a volume in memory
  const volume = await volumeLoader.createAndCacheVolume(volumeId, {
    imageIds,
  });

  addSegmentationsToState();

  // Instantiate a rendering engine
  const renderingEngine = new RenderingEngine(renderingEngineId);

  // Create a stack viewport
  const viewportInputArray = [
    {
      viewportId: viewportIdAxial,
      type: ViewportType.ORTHOGRAPHIC,
      element: elementAxial,
      defaultOptions: {
        orientation: Enums.OrientationAxis.AXIAL,
        background: <Types.Point3>[0, 0, 0],
      },
    },
    {
      viewportId: viewportIdCoronal,
      type: ViewportType.ORTHOGRAPHIC,
      element: elementCoronal,
      defaultOptions: {
        orientation: Enums.OrientationAxis.CORONAL,
        background: <Types.Point3>[0, 0, 0],
      },
    },
    {
      viewportId: viewportIdSagittal,
      type: ViewportType.ORTHOGRAPHIC,
      element: elementSagittal,
      defaultOptions: {
        orientation: Enums.OrientationAxis.SAGITTAL,
        background: <Types.Point3>[0, 0, 0],
      },
    },
  ];

  renderingEngine.setViewports(viewportInputArray);

  volume.load();

  await setVolumesForViewports(
    renderingEngine,
    [
      {
        volumeId: volumeId,
      },
    ],
    [viewportIdAxial, viewportIdCoronal, viewportIdSagittal]
  );

  // Set the tool group on the viewport
  toolGroup.addViewport(viewportIdAxial, renderingEngineId);
  toolGroup.addViewport(viewportIdCoronal, renderingEngineId);
  toolGroup.addViewport(viewportIdSagittal, renderingEngineId);

  const segMap = {
    [viewportIdAxial]: [
      {
        segmentationId,
      },
    ],
    [viewportIdCoronal]: [
      {
        segmentationId,
      },
    ],
    [viewportIdSagittal]: [
      {
        segmentationId,
      },
    ],
  };
  // Add the segmentation representation to the toolgroup
  await segmentation.addLabelmapRepresentationToViewportMap(segMap);
}

run();
