import {
  RenderingEngine,
  Types,
  Enums,
  setVolumesForViewports,
  volumeLoader,
  getRenderingEngine,
} from '@cornerstonejs/core';
import * as cornerstone from '@cornerstonejs/core';
import {
  initDemo,
  createImageIdsAndCacheMetaData,
  setTitleAndDescription,
  addToggleButtonToToolbar,
} from '../../../../utils/demo/helpers';
import { fillVolumeLabelmapWithMockData } from '../../../../utils/test/testUtils';
import * as cornerstoneTools from '@cornerstonejs/tools';

// This is for debugging purposes
console.warn(
  'Click on index.ts to open source code for this example --------->'
);

const {
  ToolGroupManager,
  Enums: csToolsEnums,
  segmentation,
} = cornerstoneTools;

const { ViewportType } = Enums;

// Define a unique id for the volume
const volumeName = 'CT_VOLUME_ID'; // Id of the volume less loader prefix
const volumeLoaderScheme = 'cornerstoneStreamingImageVolume'; // Loader id which defines which volume loader to use
const volumeId = `${volumeLoaderScheme}:${volumeName}`; // VolumeId with loader id + volume id
const segmentationId1 = 'SEGMENTATION_ID_1';
const segmentationId2 = 'SEGMENTATION_ID_2';
const toolGroupId1 = 'MY_TOOL_GROUP_ID_1';
const toolGroupId2 = 'MY_TOOL_GROUP_ID_2';
const renderingEngineId = 'myRenderingEngine';
const viewportId1 = 'CT_AXIAL_STACK';
const viewportId2 = 'CT_AXIAL_STACK_2';

// ======== Set up page ======== //
setTitleAndDescription(
  'Per Viewport Labelmap Segmentation Configuration ',
  'Here we demonstrate how to change the configuration of how a specific segmentation is rendered in a viewport. We have two viewports, each with a different toolgroup. The left viewport uses a toolgroup with global configuration for segmentation representation. The right viewport uses a toolgroup with its own scoped segmentation representation. Toggling the outline rendering for this toolgroup, the viewport will display the tool group scoped representation over the global one.'
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

let leftRepresentationUID1,
  leftRepresentationUID2,
  rightRepresentationUID1,
  rightRepresentationUID2;

const instructions = document.createElement('p');
instructions.innerText = `
  The left viewport uses a segmentation using only global configuration for
  segmentation representation. The right viewport uses a different representation. Toggling the outline rendering
  for right viewport does not affect the left viewport.
`;
// ============================= //

addToggleButtonToToolbar({
  title: 'toggle outline rendering',
  onClick: (toggle) => {
    [rightRepresentationUID1, rightRepresentationUID2].forEach(
      (representationUID) => {
        segmentation.config.setSegmentationRepresentationConfig(
          representationUID,
          {
            LABELMAP: {
              renderOutline: toggle,
            },
          }
        );
      }
    );
  },
  defaultToggle: true,
});

// ============================= //

async function addSegmentationsToState() {
  // Create a segmentation of the same resolution as the source data
  const segmentationVolume1 =
    await volumeLoader.createAndCacheDerivedSegmentationVolume(volumeId, {
      volumeId: segmentationId1,
    });
  const segmentationVolume2 =
    await volumeLoader.createAndCacheDerivedSegmentationVolume(volumeId, {
      volumeId: segmentationId2,
    });

  // Add the segmentations to state
  segmentation.addSegmentations([
    {
      segmentationId: segmentationId1,
      representation: {
        // The type of segmentation
        type: csToolsEnums.SegmentationRepresentations.Labelmap,
        // The actual segmentation data, in the case of labelmap this is a
        // reference to the source volume of the segmentation.
        data: {
          volumeId: segmentationId1,
        },
      },
    },
    {
      segmentationId: segmentationId2,
      representation: {
        type: csToolsEnums.SegmentationRepresentations.Labelmap,
        data: {
          volumeId: segmentationId2,
        },
      },
    },
  ]);

  // Add some data to the segmentations
  fillVolumeLabelmapWithMockData({
    volumeId: segmentationVolume1.volumeId,
    centerOffset: [50, 50, 0],
    cornerstone,
  });

  fillVolumeLabelmapWithMockData({
    volumeId: segmentationVolume2.volumeId,
    centerOffset: [-50, -50, 0],
    cornerstone,
  });
}

/**
 * Runs the demo
 */
async function run() {
  // Init Cornerstone and related libraries
  await initDemo();

  // Add tools to Cornerstone3D

  // Define tool groups to add the segmentation display tool to
  const toolGroup1 = ToolGroupManager.createToolGroup(toolGroupId1);
  const toolGroup2 = ToolGroupManager.createToolGroup(toolGroupId2);

  // Get Cornerstone imageIds for the source data and fetch metadata into RAM
  const imageIds = await createImageIdsAndCacheMetaData({
    StudyInstanceUID:
      '1.3.6.1.4.1.14519.5.2.1.7009.2403.334240657131972136850343327463',
    SeriesInstanceUID:
      '1.3.6.1.4.1.14519.5.2.1.7009.2403.226151125820845824875394858561',
    wadoRsRoot: 'https://d3t6nz73ql33tx.cloudfront.net/dicomweb',
  });

  const smallVolumeImageIds = [imageIds[0], imageIds[1]];

  // Define a volume in memory
  const volume = await volumeLoader.createAndCacheVolume(volumeId, {
    imageIds: smallVolumeImageIds,
  });

  // Add some segmentations based on the source data volume
  await addSegmentationsToState();

  // Instantiate a rendering engine
  const renderingEngine = new RenderingEngine(renderingEngineId);

  // Create the viewports
  const viewportInputArray = [
    {
      viewportId: viewportId1,
      type: ViewportType.ORTHOGRAPHIC,
      element: element1,
      defaultOptions: {
        orientation: Enums.OrientationAxis.AXIAL,
        background: <Types.Point3>[0.2, 0, 0.2],
      },
    },
    {
      viewportId: viewportId2,
      type: ViewportType.ORTHOGRAPHIC,
      element: element2,
      defaultOptions: {
        orientation: Enums.OrientationAxis.AXIAL,
        background: <Types.Point3>[0.2, 0, 0.2],
      },
    },
  ];

  toolGroup1.addViewport(viewportId1, renderingEngineId);
  toolGroup2.addViewport(viewportId2, renderingEngineId);

  renderingEngine.setViewports(viewportInputArray);

  // Set the volume to load
  volume.load();

  // Set volumes on the viewports
  await setVolumesForViewports(
    renderingEngine,
    [{ volumeId }],
    [viewportId1, viewportId2]
  );

  // // Add the segmentation representations to viewportId1
  [leftRepresentationUID1, leftRepresentationUID2] =
    await segmentation.addSegmentationRepresentations(viewportId1, [
      {
        segmentationId: segmentationId1,
        type: csToolsEnums.SegmentationRepresentations.Labelmap,
      },
      {
        segmentationId: segmentationId2,
        type: csToolsEnums.SegmentationRepresentations.Labelmap,
      },
    ]);

  // // Add the segmentation representations to viewportId2
  [rightRepresentationUID1, rightRepresentationUID2] =
    await segmentation.addSegmentationRepresentations(viewportId2, [
      {
        segmentationId: segmentationId1,
        type: csToolsEnums.SegmentationRepresentations.Labelmap,
      },
      {
        segmentationId: segmentationId2,
        type: csToolsEnums.SegmentationRepresentations.Labelmap,
      },
    ]);

  // Render the image
  renderingEngine.renderViewports([viewportId1, viewportId2]);
}

run();
