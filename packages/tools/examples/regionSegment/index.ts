import type { Types } from '@cornerstonejs/core';
import {
  RenderingEngine,
  Enums,
  cache,
  volumeLoader,
  setVolumesForViewports,
} from '@cornerstonejs/core';
import {
  initDemo,
  createImageIdsAndCacheMetaData,
  setTitleAndDescription,
  createInfoSection,
  addManipulationBindings,
  addButtonToToolbar,
  addSliderToToolbar,
} from '../../../../utils/demo/helpers';
import * as cornerstoneTools from '@cornerstonejs/tools';

// This is for debugging purposes
console.warn(
  'Click on index.ts to open source code for this example --------->'
);

const {
  RegionSegmentTool,
  segmentation,
  ToolGroupManager,
  Enums: csToolsEnums,
  utilities: cstUtils,
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
let toolGroup = null;

// ======== Set up page ======== //
setTitleAndDescription(
  'Region Segment Tool',
  'Demonstrates how to create a segmentation after drawing a 3D sphere and running grow cut algorithm in the GPU'
);

const viewportGrid = document.createElement('div');

viewportGrid.style.display = 'grid';
viewportGrid.style.gridTemplateColumns = `repeat(3, 33%)`;

const content = document.getElementById('content');

content.appendChild(viewportGrid);

// prettier-ignore
createInfoSection(content)
  .addInstruction('Click and drag to draw a circle to create a segmentation')
  .openNestedSection({ ordered: true })
    .addInstruction('A new volume containing a sphere for the circle drawn shall be created')
    .addInstruction('A label map shall be created for that new sub volume')
    .openNestedSection({ ordered: true })
      .addInstruction('The pixel at the center of the circle and its neighbours (3x3 grid) shall be set to "positive" seed values (segment index) on the current slice')
      .addInstruction('All points at the border of the circle shall be set to "negative" seed values on the current slice')
    .closeNestedSection()
    .addInstruction('The new sub volume and the label map shall be sent to the gpu')
    .addInstruction('The gpu shall run "Grow Cut" algorithm')
    .addInstruction('The label map shall be updated with the data returned by the gpu')
    .addInstruction('The viewports shall be updated to show the changes made to the label map')
  .closeNestedSection();

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

// addSliderToToolbar({
//   title: 'Positive threshold (50%)',
//   range: [0, 100],
//   defaultValue: 50,
//   onSelectedValueChange: (value: string) => {
//     updateSeedVariancesConfig({ positiveSeedVariance: value });
//   },
//   updateLabelOnChange: (value: string, label: HTMLElement) => {
//     label.innerHTML = `Positive threshold (${value}%)`;
//   },
// });

// addSliderToToolbar({
//   title: 'Negative threshold (90%)',
//   range: [0, 100],
//   defaultValue: 90,
//   label: {
//     html: 'test',
//   },
//   onSelectedValueChange: (value: string) => {
//     updateSeedVariancesConfig({ negativeSeedVariance: value });
//   },
//   updateLabelOnChange: (value: string, label: HTMLElement) => {
//     label.innerHTML = `Negative threshold (${value}%)`;
//   },
// });

// =============================================================================

const updateSeedVariancesConfig = cstUtils.throttle(
  ({ positiveSeedVariance, negativeSeedVariance }) => {
    const toolInstance = toolGroup.getToolInstance(RegionSegmentTool.toolName);
    const { configuration: config } = toolInstance;

    if (positiveSeedVariance !== undefined) {
      config.positiveSeedVariance = Number(positiveSeedVariance) / 100;
    }

    if (negativeSeedVariance !== undefined) {
      config.negativeSeedVariance = Number(negativeSeedVariance) / 100;
    }

    toolInstance.refresh();
  },
  1000
);

async function addSegmentationsToState() {
  // Create a segmentation of the same resolution as the source data
  await volumeLoader.createAndCacheDerivedLabelmapVolume(volumeId, {
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
  cornerstoneTools.addTool(RegionSegmentTool);

  // Define a tool group, which defines how mouse events map to tool commands for
  // Any viewport using the group
  toolGroup = ToolGroupManager.createToolGroup(toolGroupId);

  // Add the tools to the tool group
  toolGroup.addTool(RegionSegmentTool.toolName);

  // Set the initial state of the tools, here we set one tool active on left click.
  // This means left click will draw that tool.
  toolGroup.setToolActive(RegionSegmentTool.toolName, {
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
      '1.3.6.1.4.1.14519.5.2.1.7009.2403.871108593056125491804754960339',
    SeriesInstanceUID:
      '1.3.6.1.4.1.14519.5.2.1.7009.2403.780462962868572737240023906400',
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
    [viewportIdAxial]: [{ segmentationId }],
    [viewportIdCoronal]: [{ segmentationId }],
    [viewportIdSagittal]: [{ segmentationId }],
  };

  // Add the segmentation representation to the toolgroup
  await segmentation.addLabelmapRepresentationToViewportMap(segMap);
}

run();
