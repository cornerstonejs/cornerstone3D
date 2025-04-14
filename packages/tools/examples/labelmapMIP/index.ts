import type { Types } from '@cornerstonejs/core';
import {
  RenderingEngine,
  Enums,
  setVolumesForViewports,
  volumeLoader,
} from '@cornerstonejs/core';
import * as cornerstone from '@cornerstonejs/core';
import {
  initDemo,
  createImageIdsAndCacheMetaData,
  setTitleAndDescription,
  setPetColorMapTransferFunctionForVolumeActor,
  setPetTransferFunctionForVolumeActor,
  addButtonToToolbar,
} from '../../../../utils/demo/helpers';
import * as cornerstoneTools from '@cornerstonejs/tools';
import { fillVolumeLabelmapWithMockData } from '../../../../utils/test/testUtils';
import { SegmentationRepresentations } from '../../src/enums';
import { triggerSegmentationDataModified } from '../../src/stateManagement/segmentation/triggerSegmentationEvents';
import { BrushTool, SegmentSelectTool } from '../../src/tools';

// This is for debugging purposes
console.warn(
  'Click on index.ts to open source code for this example --------->'
);

const {
  ToolGroupManager,
  Enums: csToolsEnums,
  segmentation,
  VolumeRotateTool,
  StackScrollTool,
} = cornerstoneTools;

const { ViewportType, BlendModes } = Enums;
const { MouseBindings } = csToolsEnums;

// Define a unique id for the volume
const volumeName = 'CT_VOLUME_ID'; // Id of the volume less loader prefix
const volumeLoaderScheme = 'cornerstoneStreamingImageVolume'; // Loader id which defines which volume loader to use
const volumeId = `${volumeLoaderScheme}:${volumeName}`; // VolumeId with loader id + volume id
const segmentationId = 'MY_SEGMENTATION_ID';
const toolGroupId = 'MY_TOOLGROUP_ID';
// Create the viewports
const viewportId1 = 'CT_LEFT';
const viewportId2 = 'CT_MIP';

// ======== Set up page ======== //
setTitleAndDescription(
  'Labelmap Rendering over MIP data',
  'Here we demonstrate rendering of a mock ellipsoid labelmap over MIP data'
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

viewportGrid.appendChild(element1);
viewportGrid.appendChild(element2);

content.appendChild(viewportGrid);

addButtonToToolbar({
  title: 'Add Labelmap Representation',
  onClick: () => {
    segmentation.addLabelmapRepresentationToViewport(viewportId2, [
      {
        segmentationId,
        config: {
          blendMode: BlendModes.LABELMAP_EDGE_PROJECTION_BLEND,
        },
      },
    ]);
  },
});

/**
 * Runs the demo
 */
async function run() {
  // Init Cornerstone and related libraries
  await initDemo();
  cornerstoneTools.addTool(VolumeRotateTool);
  cornerstoneTools.addTool(StackScrollTool);
  cornerstoneTools.addTool(SegmentSelectTool);
  cornerstoneTools.addTool(BrushTool);

  // Define tool groups to add the segmentation display tool to
  const toolGroup = ToolGroupManager.createToolGroup(toolGroupId);
  const toolGroup2 = ToolGroupManager.createToolGroup('mipToolGroup');

  toolGroup2.addTool(VolumeRotateTool.toolName);
  toolGroup.addTool(StackScrollTool.toolName);

  [toolGroup, toolGroup2].forEach((toolGroup) => {
    toolGroup?.addTool(SegmentSelectTool.toolName);
    toolGroup?.addToolInstance('SphereBrush', BrushTool.toolName, {
      activeStrategy: 'FILL_INSIDE_SPHERE',
    });
  });

  // Get Cornerstone imageIds for the source data and fetch metadata into RAM
  const imageIds = await createImageIdsAndCacheMetaData({
    StudyInstanceUID:
      '1.3.6.1.4.1.14519.5.2.1.7009.2403.334240657131972136850343327463',
    SeriesInstanceUID:
      '1.3.6.1.4.1.14519.5.2.1.7009.2403.879445243400782656317561081015',
    wadoRsRoot: 'https://d33do7qe4w26qo.cloudfront.net/dicomweb',
  });

  // Define a volume in memory
  const volume = await volumeLoader.createAndCacheVolume(volumeId, {
    imageIds,
  });

  // Instantiate a rendering engine
  const renderingEngineId = 'myRenderingEngine';
  const renderingEngine = new RenderingEngine(renderingEngineId);

  const viewportInputArray = [
    {
      viewportId: viewportId1,
      type: ViewportType.ORTHOGRAPHIC,
      element: element1,
      defaultOptions: {
        orientation: Enums.OrientationAxis.CORONAL,
        background: <Types.Point3>[0.2, 0, 0.2],
      },
    },
    {
      viewportId: viewportId2,
      type: ViewportType.VOLUME_3D,
      element: element2,
      defaultOptions: {
        orientation: Enums.OrientationAxis.SAGITTAL,
        background: <Types.Point3>[0.2, 0, 0.2],
      },
    },
  ];

  renderingEngine.setViewports(viewportInputArray);

  toolGroup.addViewport(viewportId1, renderingEngineId);
  toolGroup2.addViewport(viewportId2, renderingEngineId);

  toolGroup.setToolActive(StackScrollTool.toolName, {
    bindings: [{ mouseButton: MouseBindings.Wheel }],
  });
  toolGroup.setToolActive('SphereBrush', {
    bindings: [{ mouseButton: MouseBindings.Primary }],
  });

  toolGroup.setToolActive(SegmentSelectTool.toolName);

  toolGroup2.setToolActive(VolumeRotateTool.toolName, {
    bindings: [{ mouseButton: MouseBindings.Wheel }],
  });

  toolGroup2.setToolActive(SegmentSelectTool.toolName);

  // Set the volume to load
  volume.load();

  await setVolumesForViewports(renderingEngine, [{ volumeId }], [viewportId1]);

  await setVolumesForViewports(
    renderingEngine,
    [
      {
        volumeId: volumeId,
        callback: setPetTransferFunctionForVolumeActor,
        blendMode: BlendModes.MAXIMUM_INTENSITY_BLEND,
        slabThickness: 50000,
      },
    ],
    [viewportId2]
  );

  // Render the image
  renderingEngine.renderViewports([viewportId1, viewportId2]);

  // Add some segmentations based on the source data volume
  // ============================= //

  // Create a segmentation of the same resolution as the source data
  volumeLoader.createAndCacheDerivedLabelmapVolume(volumeId, {
    volumeId: segmentationId,
  });

  // Add some data to the segmentations
  fillVolumeLabelmapWithMockData({
    volumeId: segmentationId,
    cornerstone,
    innerRadius: 20,
    outerRadius: 30,
    scale: [1, 2, 1],
  });

  segmentation.config.style.setStyle(
    {
      type: csToolsEnums.SegmentationRepresentations.Labelmap,
      viewportId: viewportId1,
    },
    {
      fillAlpha: 0.0,
      activeSegmentOutlineWidthDelta: 3,
    }
  );

  segmentation.config.style.setStyle(
    {
      type: csToolsEnums.SegmentationRepresentations.Labelmap,
      viewportId: viewportId2,
    },
    {
      activeSegmentOutlineWidthDelta: 3,
    }
  );

  // Add the segmentations to state
  segmentation.addSegmentations([
    {
      segmentationId,
      representation: {
        type: SegmentationRepresentations.Labelmap,
        data: {
          volumeId: segmentationId,
        },
      },
    },
  ]);

  await segmentation.addLabelmapRepresentationToViewport(viewportId1, [
    { segmentationId },
  ]);

  triggerSegmentationDataModified(segmentationId);
}

run();
