import {
  RenderingEngine,
  Types,
  Enums,
  volumeLoader,
  getRenderingEngine,
  CONSTANTS,
  utilities,
  cache,
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
import cornerstoneWADOImageLoader from 'cornerstone-wado-image-loader';

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
const viewportId1 = 'CT_SAGITTAL_STACK';
const viewportId2 = 'COMPUTED_STACK';

const orientations = [
  Enums.OrientationAxis.AXIAL,
  Enums.OrientationAxis.SAGITTAL,
  Enums.OrientationAxis.CORONAL,
];
const operations = ['SUM', 'AVERAGE', 'SUBTRACT'];
let dataOperation = operations[0];
// ======== Set up page ======== //
setTitleAndDescription(
  '3D Volume Generation From 4D Data',
  'Generates a 3D volume using the SUM, AVERAGE, or SUBTRACT operators from a 4D time series.'
);

const size = '500px';
const content = document.getElementById('content');
const viewportGrid = document.createElement('div');
// const element = document.createElement('div');

viewportGrid.style.display = 'flex';
viewportGrid.style.flexDirection = 'row';

// element.id = 'cornerstone-element';
// element.style.width = '500px';
// element.style.height = '500px';
const element1 = document.createElement('div');
const element2 = document.createElement('div');
element1.style.width = size;
element1.style.height = size;
element2.style.width = size;
element2.style.height = size;

element1.oncontextmenu = (e) => e.preventDefault();
element2.oncontextmenu = (e) => e.preventDefault();

// content.appendChild(element);
viewportGrid.appendChild(element1);
viewportGrid.appendChild(element2);

content.appendChild(viewportGrid);
// ============================= //
let volumeForButton;
addButtonToToolbar({
  title: 'Generate Image',
  onClick: () => {
    const dataInTime = csToolsUtilities.dynamicVolume.generateImageFromTime(
      volumeForButton,
      dataOperation,
      {
        frameNumbers: [0, 1, 3],
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
      renderingEngine.getViewport(viewportId1)
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
const computedVolumeName = 'PT_VOLUME_ID';
const computedVolumeId = `cornerstoneStreamingImageVolume:${computedVolumeName}`; // VolumeId with loader id + volume id
const toolGroupId = 'MY_TOOLGROUP_ID';
let renderingEngine;
let viewport;
let viewport2;
let computedVolume;

async function createVolumeFromTimeData(dataInTime) {
  // Fill the scalar data of the computed volume with the operation data
  const scalarData = computedVolume.getScalarData();
  for (let i = 0; i < dataInTime.length; i++) {
    scalarData[i] = dataInTime[i];
  }

  const { imageData, vtkOpenGLTexture } = computedVolume;
  const numSlices = imageData.getDimensions()[2];
  const slicesToUpdate = [...Array(numSlices).keys()];
  slicesToUpdate.forEach((i) => {
    vtkOpenGLTexture.setUpdatedFrame(i);
  });
  imageData.modified();

  // Set computed volume to second viewport
  viewport2.setVolumes([
    {
      volumeId: computedVolumeId,
      callback: setPetTransferFunctionForVolumeActor,
    },
  ]);

  viewport2.render();
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

  const { metaDataManager } = cornerstoneWADOImageLoader.wadors;

  // Get Cornerstone imageIds and fetch metadata into RAM
  let imageIds = await createImageIdsAndCacheMetaData({
    StudyInstanceUID:
      '1.3.6.1.4.1.12842.1.1.14.3.20220915.105557.468.2963630849',
    SeriesInstanceUID:
      '1.3.6.1.4.1.12842.1.1.22.4.20220915.124758.560.4125514885',
    wadoRsRoot: 'https://d28o5kq0jsoob5.cloudfront.net/dicomweb',
  });

  const MAX_NUM_TIMEPOINTS = 40;
  const numTimePoints = 5;
  const NUM_IMAGES_PER_TIME_POINT = 235;
  const TOTAL_NUM_IMAGES = MAX_NUM_TIMEPOINTS * NUM_IMAGES_PER_TIME_POINT;
  const numImagesToLoad = numTimePoints * NUM_IMAGES_PER_TIME_POINT;

  // Load the last N time points because they have a better image quality
  // and first ones are white or contains only a few black pixels
  const firstInstanceNumber = TOTAL_NUM_IMAGES - numImagesToLoad + 1;

  imageIds = imageIds.filter((imageId) => {
    const instanceMetaData = metaDataManager.get(imageId);
    const instanceTag = instanceMetaData['00200013'];
    const instanceNumber = parseInt(instanceTag.Value[0]);

    return instanceNumber >= firstInstanceNumber;
  });

  // Instantiate a rendering engine
  renderingEngine = new RenderingEngine(renderingEngineId);
  // Create a stack viewport
  const viewportInput1 = {
    viewportId: viewportId1,
    type: ViewportType.ORTHOGRAPHIC,
    element: element1,
    defaultOptions: {
      orientation: Enums.OrientationAxis.ACQUISITION,
      background: <Types.Point3>[0.2, 0, 0.2],
    },
  };
  const viewportInput2 = {
    viewportId: viewportId2,
    type: ViewportType.ORTHOGRAPHIC,
    element: element2,
    defaultOptions: {
      orientation: Enums.OrientationAxis.ACQUISITION,
      background: <Types.Point3>[0.2, 0, 0.2],
    },
  };

  renderingEngine.enableElement(viewportInput1);
  renderingEngine.enableElement(viewportInput2);

  // Add viewport to toolGroup
  toolGroup.addViewport(viewportId1, renderingEngineId);

  // Get the stack viewport that was created
  viewport = <Types.IVolumeViewport>renderingEngine.getViewport(viewportId1);
  viewport2 = <Types.IVolumeViewport>renderingEngine.getViewport(viewportId2);

  // Define a volume in memory
  const volume = await volumeLoader.createAndCacheVolume(volumeId, {
    imageIds,
  });

  computedVolume = await volumeLoader.createAndCacheDerivedVolume(volumeId, {
    volumeId: computedVolumeId,
  });

  // Set the volume to load
  volume.load();

  volumeForButton = volume;
  addTimePointSlider(volume);

  // Set the volume on the viewport
  viewport.setVolumes([
    { volumeId, callback: setPetTransferFunctionForVolumeActor },
  ]);

  // Render the image
  viewport.render();
  viewport2.render();
}
run();
