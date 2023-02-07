import {
  RenderingEngine,
  Types,
  Enums,
  setVolumesForViewports,
  volumeLoader,
  getRenderingEngine,
} from '@cornerstonejs/core';
import {
  initDemo,
  createImageIdsAndCacheMetaData,
  setTitleAndDescription,
  addToggleButtonToToolbar,
  addSliderToToolbar,
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
  'Global Segmentation Configuration',
  'Here we demonstrate how to change the global segmentation configuration'
);

const size = '500px';
const content = document.getElementById('content');
const element = document.createElement('div');

element.style.width = size;
element.style.height = size;

content.appendChild(element);
// ============================= //

function setConfigValue(property, value) {
  const config = segmentation.config.getGlobalConfig();

  config.representations.LABELMAP[property] = value;
  segmentation.config.setGlobalConfig(config);

  const renderingEngine = getRenderingEngine(renderingEngineId);

  renderingEngine.renderViewports([viewportId]);
}

addToggleButtonToToolbar({
  title: 'toggle render inactive segmentations',
  onClick: (toggle) => {
    const config = segmentation.config.getGlobalConfig();

    config.renderInactiveSegmentations = toggle;
    segmentation.config.setGlobalConfig(config);

    const renderingEngine = getRenderingEngine(renderingEngineId);

    renderingEngine.renderViewports([viewportId]);
  },
  defaultToggle: true,
});
addToggleButtonToToolbar({
  title: 'toggle outline rendering',
  onClick: (toggle) => {
    setConfigValue('renderOutline', toggle);
  },
  defaultToggle: true,
});
addToggleButtonToToolbar({
  title: 'toggle fill rendering',
  onClick: (toggle) => {
    setConfigValue('renderFill', toggle);
  },
  defaultToggle: true,
});

addSliderToToolbar({
  title: 'outline width active',
  range: [1, 5],
  defaultValue: 1,
  onSelectedValueChange: (value) => {
    setConfigValue('outlineWidthActive', value);
  },
});
addSliderToToolbar({
  title: 'outline alpha active',
  range: [0, 100],
  defaultValue: 100,
  onSelectedValueChange: (value) => {
    setConfigValue('outlineOpacity', Number(value) / 100);
  },
});
addSliderToToolbar({
  title: 'outline width inactive',
  range: [1, 5],
  defaultValue: 1,
  onSelectedValueChange: (value) => {
    setConfigValue('outlineWidthInactive', value);
  },
});
addSliderToToolbar({
  title: 'fill alpha',
  range: [0, 100],
  defaultValue: 50,
  onSelectedValueChange: (value) => {
    const mappedValue = Number(value) / 100.0;

    setConfigValue('fillAlpha', mappedValue);
  },
});
addSliderToToolbar({
  title: 'fill alpha inactive',
  range: [0, 100],
  defaultValue: 50,
  onSelectedValueChange: (value) => {
    const mappedValue = Number(value) / 100.0;
    setConfigValue('fillAlphaInactive', mappedValue);
  },
});

// ============================= //

/**
 * Adds two concentric circles to each axial slice of the demo segmentation.
 */
function fillSegmentationWithCircles(segmentationVolume, centerOffset) {
  const scalarData = segmentationVolume.scalarData;

  let voxelIndex = 0;

  const { dimensions } = segmentationVolume;

  const innerRadius = dimensions[0] / 8;
  const outerRadius = dimensions[0] / 4;

  const center = [
    dimensions[0] / 2 + centerOffset[0],
    dimensions[1] / 2 + centerOffset[1],
  ];

  for (let z = 0; z < dimensions[2]; z++) {
    for (let y = 0; y < dimensions[1]; y++) {
      for (let x = 0; x < dimensions[0]; x++) {
        const distanceFromCenter = Math.sqrt(
          (x - center[0]) * (x - center[0]) + (y - center[1]) * (y - center[1])
        );
        if (distanceFromCenter < innerRadius) {
          scalarData[voxelIndex] = 1;
        } else if (distanceFromCenter < outerRadius) {
          scalarData[voxelIndex] = 2;
        }

        voxelIndex++;
      }
    }
  }
}

async function addSegmentationsToState() {
  // Create a segmentation of the same resolution as the source data
  // using volumeLoader.createAndCacheDerivedVolume.
  const segmentationVolume1 = await volumeLoader.createAndCacheDerivedVolume(
    volumeId,
    {
      volumeId: segmentationId1,
    }
  );
  const segmentationVolume2 = await volumeLoader.createAndCacheDerivedVolume(
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

  // Add some data to the segmentations
  fillSegmentationWithCircles(segmentationVolume1, [50, 50]);
  fillSegmentationWithCircles(segmentationVolume2, [-50, -50]);
}

/**
 * Runs the demo
 */
async function run() {
  // Init Cornerstone and related libraries
  await initDemo();

  // Add tools to Cornerstone3D
  cornerstoneTools.addTool(SegmentationDisplayTool);

  // Define tool groups to add the segmentation display tool to
  const toolGroup = ToolGroupManager.createToolGroup(toolGroupId);

  toolGroup.addTool(SegmentationDisplayTool.toolName);
  toolGroup.setToolEnabled(SegmentationDisplayTool.toolName);

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

  // // Add the segmentation representations to the toolgroup
  await segmentation.addSegmentationRepresentations(toolGroupId, [
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
