import {
  RenderingEngine,
  Types,
  Enums,
  volumeLoader,
  getRenderingEngine,
  CONSTANTS,
  utilities,
} from '@cornerstonejs/core';
import {
  initDemo,
  createImageIdsAndCacheMetaData,
  setTitleAndDescription,
  setPetTransferFunctionForVolumeActor,
  addSliderToToolbar,
  addDropdownToToolbar,
  addButtonToToolbar,
} from '../../../../utils/demo/helpers';
import * as cornerstoneTools from '@cornerstonejs/tools';
const {
  segmentation,
  SegmentationDisplayTool,
  utilities: csToolsUtilities,
  Enums: csToolsEnums,
} = cornerstoneTools;
// This is for debugging purposes
console.warn(
  'Click on index.ts to open source code for this example --------->'
);
const { ViewportType } = Enums;
const renderingEngineId = 'myRenderingEngine';
const viewportId = 'CT_SAGITTAL_STACK';
const orientations = [
  Enums.OrientationAxis.AXIAL,
  Enums.OrientationAxis.SAGITTAL,
  Enums.OrientationAxis.CORONAL,
];
const operations = ['SUM', 'AVERAGE', 'SUBTRACT'];
let dataOperation = operations[0];
// ======== Set up page ======== //
setTitleAndDescription(
  'Volume 4D',
  'Displays a 4D DICOM series in a Volume viewport.'
);
const content = document.getElementById('content');
const element = document.createElement('div');
element.id = 'cornerstone-element';
element.style.width = '500px';
element.style.height = '500px';
content.appendChild(element);
// ============================= //
let volumeForButton;
addButtonToToolbar({
  title: 'Get Data In Time',
  onClick: () => {
    const dataInTime = csToolsUtilities.dynamicVolume.generateImageFromTime(
      volumeForButton,
      dataOperation,
      {
        frameNumbers: [1, 39],
        // imageCoordinate: [-24, 24, -173],
        maskVolumeId: segmentationId,
      }
    );
    createVolumeFromTimeData(dataInTime);
  },
});

addDropdownToToolbar({
  options: {
    values: operations,
    defaultValue: operations[0],
  },
  onSelectedValueChange: (selectedValue) => {
    dataOperation = selectedValue as string;
  },
});

addDropdownToToolbar({
  options: {
    values: orientations,
    defaultValue: orientations[0],
  },
  onSelectedValueChange: (selectedValue) => {
    // Get the rendering engine
    const renderingEngine = getRenderingEngine(renderingEngineId);
    // Get the volume viewport
    const viewport = <Types.IVolumeViewport>(
      renderingEngine.getViewport(viewportId)
    );
    viewport.setOrientation(<Enums.OrientationAxis>selectedValue);
    viewport.render();
  },
});
function addTimePointSlider(volume) {
  addSliderToToolbar({
    title: 'Time Point',
    range: [0, volume.numTimePoints - 1],
    defaultValue: 0,
    onSelectedValueChange: (value) => {
      const timePointIndex = Number(value);
      volume.timePointIndex = timePointIndex;
    },
  });
}
// ==================================== //
// Define a unique id for the volume
const volumeName = 'CT_VOLUME_ID'; // Id of the volume less loader prefix
// const volumeLoaderScheme = 'cornerstoneStreamingImageVolume'; // Loader id which defines which volume loader to use
const volumeLoaderScheme = 'cornerstoneStreamingDynamicImageVolume'; // Loader id which defines which volume loader to use
const volumeId = `${volumeLoaderScheme}:${volumeName}`; // VolumeId with loader id + volume id
const segmentationId = 'MY_SEGMENTATION_ID';
const computedVolumeId = 'MY_COMPUTED_ID';
const toolGroupId = 'MY_TOOLGROUP_ID';
/**
 * Adds two concentric circles to each axial slice of the demo segmentation.
 */
function createMockEllipsoidSegmentation(segmentationVolume) {
  const scalarData = segmentationVolume.scalarData;
  const { dimensions } = segmentationVolume;
  const center = [72, 145, 117.5];
  const innerRadius = 20;
  let voxelIndex = 0;
  for (let z = 0; z < dimensions[2]; z++) {
    for (let y = 0; y < dimensions[1]; y++) {
      for (let x = 0; x < dimensions[0]; x++) {
        const distanceFromCenter = Math.sqrt(
          (x - center[0]) * (x - center[0]) +
            (y - center[1]) * (y - center[1]) +
            (z - center[2]) * (z - center[2])
        );
        if (distanceFromCenter < innerRadius) {
          scalarData[voxelIndex] = 1;
        }
        voxelIndex++;
      }
    }
  }
}
async function addSegmentationsToState() {
  // Create a segmentation of the same resolution as the source data
  // using volumeLoader.createAndCacheDerivedVolume.
  const segmentationVolume = await volumeLoader.createAndCacheDerivedVolume(
    volumeId,
    {
      volumeId: segmentationId,
    }
  );
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
  // Add some data to the segmentations
  createMockEllipsoidSegmentation(segmentationVolume);
}

async function createVolumeFromTimeData(dataInTime) {
  // Create a volume of the same resolution as the source data
  // using volumeLoader.createAndCacheDerivedVolume.
  // console.log('beep');
  // const computedVolume = await volumeLoader.createAndCacheDerivedVolume(
  //   volumeId,
  //   {
  //     volumeId: computedVolumeId,
  //   }
  // );
  // // Add the segmentations to state
  // const data = dataInTime.data;
  // const index = dataInTime.index;
  // let i = 0;
  // index.forEach((voxelIndex) => {
  //   computedVolume.scalarData[voxelIndex] = data[i];
  //   i++;
  // });
  // // computedVolume.imageData.setPointData();
  // console.log(computedVolume);
  // Add some data to the segmentations
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
  const toolGroup =
    cornerstoneTools.ToolGroupManager.createToolGroup(toolGroupId);
  toolGroup.addTool(SegmentationDisplayTool.toolName);
  toolGroup.setToolEnabled(SegmentationDisplayTool.toolName);
  // Get Cornerstone imageIds and fetch metadata into RAM
  const imageIds = await createImageIdsAndCacheMetaData({
    StudyInstanceUID:
      '1.3.6.1.4.1.12842.1.1.14.3.20220915.105557.468.2963630849',
    SeriesInstanceUID:
      '1.3.6.1.4.1.12842.1.1.22.4.20220915.124758.560.4125514885',
    wadoRsRoot: 'https://d28o5kq0jsoob5.cloudfront.net/dicomweb',
  });
  // Instantiate a rendering engine
  const renderingEngine = new RenderingEngine(renderingEngineId);
  // Create a stack viewport
  const viewportInput = {
    viewportId,
    type: ViewportType.ORTHOGRAPHIC,
    element,
    defaultOptions: {
      orientation: Enums.OrientationAxis.ACQUISITION,
      background: <Types.Point3>[0.2, 0, 0.2],
    },
  };
  renderingEngine.enableElement(viewportInput);
  // Add viewport to toolGroup
  toolGroup.addViewport(viewportId, renderingEngineId);
  // Get the stack viewport that was created
  const viewport = <Types.IVolumeViewport>(
    renderingEngine.getViewport(viewportId)
  );
  // Define a volume in memory
  const volume = await volumeLoader.createAndCacheVolume(volumeId, {
    imageIds,
  });
  // Add segmentation
  await addSegmentationsToState();
  // Set the volume to load
  volume.load();
  volumeForButton = volume;
  addTimePointSlider(volume);
  // Set the volume on the viewport
  viewport.setVolumes([
    { volumeId, callback: setPetTransferFunctionForVolumeActor },
  ]);
  await segmentation.addSegmentationRepresentations(toolGroupId, [
    {
      segmentationId,
      type: csToolsEnums.SegmentationRepresentations.Labelmap,
    },
  ]);
  // Render the image
  viewport.render();
}
run();
