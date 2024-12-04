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
  addButtonToToolbar,
} from '../../../../utils/demo/helpers';
import { fillVolumeLabelmapWithMockData } from '../../../../utils/test/testUtils';
import * as cornerstoneTools from '@cornerstonejs/tools';
import { removeLabelmapRepresentation } from '../../src/stateManagement/segmentation';
import { triggerSegmentationDataModified } from '../../src/stateManagement/segmentation/triggerSegmentationEvents';

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
const toolGroupId = 'MY_ TOOL_GROUP_ID';

// ======== Set up page ======== //
setTitleAndDescription(
  'Swapping labelmap segmentations on a viewport',
  'Here we demonstrate how to display labelmaps on a volume viewport, and swap which labelmap is being displayed'
);

const size = '500px';
const content = document.getElementById('content');
const element = document.createElement('div');

element.style.width = size;
element.style.height = size;

content.appendChild(element);

const instructions = document.createElement('p');
instructions.innerText = `
  Click the Swap Segmentation button to swap the segmentation being displayed
`;

content.append(instructions);
// ============================= //

let segmentationDisplayed = segmentationId1;
let viewportId;

addButtonToToolbar({
  title: 'Swap Segmentation',
  onClick: async () => {
    if (segmentationDisplayed === segmentationId1) {
      removeLabelmapRepresentation(viewportId, segmentationId1, true);

      // Add segmentation 2
      await segmentation.addLabelmapRepresentationToViewport(viewportId, [
        {
          segmentationId: segmentationId2,
        },
      ]);

      triggerSegmentationDataModified(segmentationId2);

      segmentationDisplayed = segmentationId2;
    } else {
      removeLabelmapRepresentation(viewportId, segmentationId2, true);
      // Add segmentation 1
      await segmentation.addLabelmapRepresentationToViewport(viewportId, [
        {
          segmentationId: segmentationId1,
        },
      ]);

      triggerSegmentationDataModified(segmentationId1);

      segmentationDisplayed = segmentationId1;
    }
  },
});

// ============================= //

async function addSegmentationsToState() {
  // Create a segmentation of the same resolution as the source data
  const segmentationVolume1 = volumeLoader.createAndCacheDerivedLabelmapVolume(
    volumeId,
    {
      volumeId: segmentationId1,
    }
  );
  const segmentationVolume2 = volumeLoader.createAndCacheDerivedLabelmapVolume(
    volumeId,
    {
      volumeId: segmentationId2,
    }
  );

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
  const toolGroup = ToolGroupManager.createToolGroup(toolGroupId);

  // Get Cornerstone imageIds for the source data and fetch metadata into RAM
  const imageIds = await createImageIdsAndCacheMetaData({
    StudyInstanceUID:
      '1.3.6.1.4.1.14519.5.2.1.7009.2403.334240657131972136850343327463',
    SeriesInstanceUID:
      '1.3.6.1.4.1.14519.5.2.1.7009.2403.226151125820845824875394858561',
    wadoRsRoot: 'https://d14fa38qiwhyfd.cloudfront.net/dicomweb',
  });

  const smallVolumeImageIds = [imageIds[0], imageIds[1]];

  // Define a volume in memory
  const volume = await volumeLoader.createAndCacheVolume(volumeId, {
    imageIds: smallVolumeImageIds,
  });

  // Add some segmentations based on the source data volume
  await addSegmentationsToState();

  // Instantiate a rendering engine
  const renderingEngineId = 'myRenderingEngine';
  const renderingEngine = new RenderingEngine(renderingEngineId);

  // Create the viewports
  viewportId = 'CT_AXIAL';

  const viewportInput = {
    viewportId,
    type: ViewportType.ORTHOGRAPHIC,
    element,
    defaultOptions: {
      orientation: Enums.OrientationAxis.AXIAL,
      background: <Types.Point3>[0.2, 0, 0.2],
    },
  };

  toolGroup.addViewport(viewportId, renderingEngineId);

  renderingEngine.enableElement(viewportInput);

  // Set the volume to load
  volume.load();

  // Set volumes on the viewports
  await setVolumesForViewports(renderingEngine, [{ volumeId }], [viewportId]);

  // // Add the first segmentation representation to the viewport
  await segmentation.addLabelmapRepresentationToViewport(viewportId, [
    {
      segmentationId: segmentationId1,
    },
  ]);

  triggerSegmentationDataModified(segmentationId1);

  // Render the image
  renderingEngine.renderViewports([viewportId]);
}

run();
