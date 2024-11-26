import type { Types } from '@cornerstonejs/core';
import {
  RenderingEngine,
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
  addSliderToToolbar,
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
const toolGroupId = 'MY_ TOOL_GROUP_ID';
const renderingEngineId = 'myRenderingEngine';
const viewportId = 'CT_AXIAL_STACK';

// ======== Set up page ======== //
setTitleAndDescription(
  'Global Labelmap Segmentation Configuration',
  'Here we demonstrate how to change the global labelmap configuration'
);

const size = '500px';
const content = document.getElementById('content');
const element = document.createElement('div');

element.style.width = size;
element.style.height = size;

content.appendChild(element);
// ============================= //

addToggleButtonToToolbar({
  title: 'toggle render inactive segmentations',
  onClick: (toggle) => {
    segmentation.config.style.setRenderInactiveSegmentations(
      viewportId,
      toggle
    );
  },
  defaultToggle: true,
});

addToggleButtonToToolbar({
  title: 'toggle outline rendering',
  onClick: (toggle) => {
    segmentation.config.style.setStyle(
      {
        type: csToolsEnums.SegmentationRepresentations.Labelmap,
      },
      {
        renderOutline: toggle,
      }
    );
  },
  defaultToggle: true,
});
addToggleButtonToToolbar({
  title: 'toggle fill rendering',
  onClick: (toggle) => {
    segmentation.config.style.setStyle(
      {
        type: csToolsEnums.SegmentationRepresentations.Labelmap,
      },
      {
        renderFill: toggle,
      }
    );
  },
  defaultToggle: true,
});

addSliderToToolbar({
  id: 'outlineWidthActive',
  title: 'outline width active',
  range: [1, 5],
  defaultValue: 1,
  onSelectedValueChange: (value) => {
    segmentation.config.style.setStyle(
      {
        type: csToolsEnums.SegmentationRepresentations.Labelmap,
      },
      {
        outlineWidth: Number(value),
      }
    );
  },
});

addSliderToToolbar({
  id: 'outlineAlphaActive',
  title: 'outline alpha active',
  range: [0, 100],
  defaultValue: 100,
  onSelectedValueChange: (value) => {
    segmentation.config.style.setStyle(
      {
        type: csToolsEnums.SegmentationRepresentations.Labelmap,
      },
      {
        outlineOpacity: Number(value) / 100,
      }
    );
  },
});
addSliderToToolbar({
  id: 'outlineWidthInactive',
  title: 'outline width inactive',
  range: [1, 5],
  defaultValue: 1,
  onSelectedValueChange: (value) => {
    segmentation.config.style.setStyle(
      {
        type: csToolsEnums.SegmentationRepresentations.Labelmap,
      },
      {
        outlineWidthInactive: Number(value),
      }
    );
  },
});
addSliderToToolbar({
  id: 'fillAlphaActive',
  title: 'fill alpha',
  range: [0, 100],
  defaultValue: 50,
  onSelectedValueChange: (value) => {
    const mappedValue = Number(value) / 100.0;

    segmentation.config.style.setStyle(
      {
        type: csToolsEnums.SegmentationRepresentations.Labelmap,
      },
      {
        fillAlpha: mappedValue,
      }
    );
  },
});
addSliderToToolbar({
  id: 'fillAlphaInactive',
  title: 'fill alpha inactive',
  range: [0, 100],
  defaultValue: 50,
  onSelectedValueChange: (value) => {
    const mappedValue = Number(value) / 100.0;
    segmentation.config.style.setStyle(
      {
        type: csToolsEnums.SegmentationRepresentations.Labelmap,
      },
      {
        fillAlphaInactive: mappedValue,
      }
    );
  },
});

// ============================= //

async function addSegmentationsToState() {
  // Create a segmentation of the same resolution as the source data
  const segmentationVolume1 =
    await volumeLoader.createAndCacheDerivedLabelmapVolume(volumeId, {
      volumeId: segmentationId1,
    });
  const segmentationVolume2 =
    await volumeLoader.createAndCacheDerivedLabelmapVolume(volumeId, {
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
  const renderingEngine = new RenderingEngine(renderingEngineId);

  // Create the viewports
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

  // // Add the segmentation representations to the viewport
  await segmentation.addSegmentationRepresentations(viewportId, [
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
  renderingEngine.renderViewports([viewportId]);
}

run();
