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
const highResSegmentationId = 'HIGH_RES_SEGMENTATION_ID';
const lowResSegmentationId = 'LOW_RES_SEGMENTATION_ID';

// The amount we should downsample the second example segmentation (should be a factor of 2)
const DOWN_SAMPLE_RATE = 8;

// ======== Set up page ======== //
setTitleAndDescription(
  'Labelmap Rendering with different resolution to source data',
  'Here we demonstrate that the segmentation resolution need not be the same as the source data.'
);

const size = '500px';
const content = document.getElementById('content');
const viewportGrid = document.createElement('div');

viewportGrid.style.display = 'flex';
viewportGrid.style.display = 'flex';
viewportGrid.style.flexDirection = 'row';

const element1 = document.createElement('div');
element1.style.width = size;
element1.style.height = size;

viewportGrid.appendChild(element1);

content.appendChild(viewportGrid);

const instructions = document.createElement('p');
instructions.innerText = `
  Here we show how to render two different segmentations at different resolutions to the source data.
`;

content.append(instructions);
// ============================= //

async function addSegmentations(viewportId1) {
  // Create a segmentation of the same resolution as the source data
  const highResSegmentationVolume =
    await volumeLoader.createAndCacheDerivedLabelmapVolume(volumeId, {
      volumeId: highResSegmentationId,
    });

  // Create a segmentation at a lower resolution than the source data,
  // using custom properties and
  const highResDimensions = highResSegmentationVolume.dimensions;
  const highResSpacing = highResSegmentationVolume.spacing;

  const direction = [];

  for (let i = 0; i < 9; i++) {
    direction[i] = highResSegmentationVolume.direction[i];
  }

  const localVolumeOptions = {
    scalarData: new Uint8Array(
      highResSegmentationVolume.voxelManager.getScalarDataLength() /
        (DOWN_SAMPLE_RATE * DOWN_SAMPLE_RATE)
    ),
    metadata: highResSegmentationVolume.metadata, // Just use the same metadata for the example.
    dimensions: [
      highResDimensions[0] / DOWN_SAMPLE_RATE,
      highResDimensions[1] / DOWN_SAMPLE_RATE,
      highResDimensions[2],
    ] as Types.Point3,
    spacing: [
      highResSpacing[0] * DOWN_SAMPLE_RATE,
      highResSpacing[1] * DOWN_SAMPLE_RATE,
      highResSpacing[2],
    ] as Types.Point3,
    origin: [...highResSegmentationVolume.origin] as Types.Point3,
    direction: direction as Types.Mat3,
  };

  const lowResSegmentationVolume = await volumeLoader.createLocalVolume(
    lowResSegmentationId,
    localVolumeOptions
  );

  // Add the segmentations to state
  segmentation.addSegmentations([
    {
      segmentationId: highResSegmentationId,
      representation: {
        // The type of segmentation
        type: csToolsEnums.SegmentationRepresentations.Labelmap,
        // The actual segmentation data, in the case of labelmap this is a
        // reference to the source volume of the segmentation.
        data: {
          volumeId: highResSegmentationId,
        },
      },
    },
    {
      segmentationId: lowResSegmentationId,
      representation: {
        type: csToolsEnums.SegmentationRepresentations.Labelmap,
        data: {
          volumeId: lowResSegmentationId,
        },
      },
    },
  ]);

  // Add some data to the segmentations
  fillVolumeLabelmapWithMockData({
    volumeId: highResSegmentationVolume.volumeId,
    cornerstone,
  });
  fillVolumeLabelmapWithMockData({
    volumeId: lowResSegmentationVolume.volumeId,
    cornerstone,
    centerOffset: [10, 10, 0],
  });

  // Add segmentation representations to the viewports
  await segmentation.addLabelmapRepresentationToViewportMap({
    [viewportId1]: [
      {
        segmentationId: highResSegmentationId,
        type: csToolsEnums.SegmentationRepresentations.Labelmap,
      },
      {
        segmentationId: lowResSegmentationId,
        type: csToolsEnums.SegmentationRepresentations.Labelmap,
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

  // Define tool groups to add the segmentation display tool to
  const toolGroupId = 'HIGH_RESOLUTION_TOOLGROUP_ID';
  const toolGroup = ToolGroupManager.createToolGroup(toolGroupId);

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

  // Instantiate a rendering engine
  const renderingEngineId = 'myRenderingEngine';
  const renderingEngine = new RenderingEngine(renderingEngineId);

  // Create the viewports
  const viewportId1 = 'CT_AXIAL_STACK_1';

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
  ];

  renderingEngine.setViewports(viewportInputArray);

  addSegmentations(viewportId1);

  toolGroup.addViewport(viewportId1, renderingEngineId);

  // Set the volume to load
  volume.load();

  // Set volumes on the viewports
  await setVolumesForViewports(renderingEngine, [{ volumeId }], [viewportId1]);

  // Render the image
  renderingEngine.render();
}

run();
