import type { Types } from '@cornerstonejs/core';
import {
  RenderingEngine,
  Enums,
  volumeLoader,
  getRenderingEngine,
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
import cornerstoneDICOMImageLoader from '@cornerstonejs/dicom-image-loader';

const {
  utilities: csToolsUtilities,
  Enums: csToolsEnums,
  PanTool,
  StackScrollTool,
  ZoomTool,
} = cornerstoneTools;

const { MouseBindings } = csToolsEnums;
// This is for debugging purposes
console.warn(
  'Click on index.ts to open source code for this example --------->'
);
const { ViewportType } = Enums;
const renderingEngineId = 'myRenderingEngine';
const viewportId1 = 'CT_SAGITTAL_STACK';
const viewportId2 = 'COMPUTED_STACK';
let dimensionGroups;

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
  'Generates a 3D volume using the SUM, AVERAGE, or SUBTRACT operators for a 4D time series.\nEnter the dimension group numbers to use separated by commas (ex: 0,1,3,4) then press "Set Dimension Groups". \nNote: the index for the dimension groups starts at 0'
);

const size = '500px';
const content = document.getElementById('content');
const viewportGrid = document.createElement('div');

viewportGrid.style.display = 'flex';
viewportGrid.style.flexDirection = 'row';

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
    const dataInTime = csToolsUtilities.dynamicVolume.generateImageFromTimeData(
      volumeForButton,
      <Enums.GenerateImageType>dataOperation,
      {
        dimensionGroupNumbers: dimensionGroups,
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
    if (!renderingEngine) {
      return;
    }
    // Get the volume viewport
    const viewport = <Types.IVolumeViewport>(
      renderingEngine.getViewport(viewportId1)
    );
    viewport.setOrientation(<Enums.OrientationAxis>selectedValue);
    viewport.render();
  },
});

addButtonToToolbar({
  title: 'Set Dimension Groups',
  onClick: () => {
    const input = document.getElementById('myText') as HTMLInputElement;
    const x = input?.value.split(',') || [];
    const dimensionGroupNumbers = x.map((val) => Number(val));
    dimensionGroups = dimensionGroupNumbers;
  },
});

function addTextInputBox() {
  const id = 'myText';
  const title = 'Enter dimension group numbers';
  const textbox = document.createElement('input');
  const value = '';
  textbox.id = id;
  textbox.innerHTML = title;
  textbox.value = value;

  const container = document.getElementById('demo-toolbar');
  if (container) {
    container.append(textbox);
  }
}

function addDimensionGroupSlider(volume) {
  addSliderToToolbar({
    title: 'Dimension Group Number',
    range: [1, volume.numDimensionGroups],
    defaultValue: 1,
    onSelectedValueChange: (value) => {
      const dimensionGroupNumber = Number(value);
      volume.dimensionGroupNumber = dimensionGroupNumber;
    },
  });
}

// ==================================== //
// Define a unique id for the volume
const volumeName = 'CT_VOLUME_ID'; // Id of the volume less loader prefix
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
  const computedVoxelManager = computedVolume.voxelManager;
  for (let i = 0; i < dataInTime.length; i++) {
    computedVoxelManager.setAtIndex(i, dataInTime[i]);
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
  cornerstoneTools.addTool(PanTool);
  cornerstoneTools.addTool(StackScrollTool);
  cornerstoneTools.addTool(ZoomTool);
  // Define tool groups to add the segmentation display tool to
  const toolGroup =
    cornerstoneTools.ToolGroupManager.createToolGroup(toolGroupId);
  toolGroup.addTool(PanTool.toolName);
  toolGroup.addTool(StackScrollTool.toolName);
  toolGroup.addTool(ZoomTool.toolName);
  toolGroup.setToolActive(StackScrollTool.toolName, {
    bindings: [{ mouseButton: MouseBindings.Wheel }],
  });
  toolGroup.setToolActive(PanTool.toolName, {
    bindings: [
      {
        mouseButton: MouseBindings.Auxiliary, // Middle Click
      },
    ],
  });
  toolGroup.setToolActive(ZoomTool.toolName, {
    bindings: [
      {
        mouseButton: MouseBindings.Secondary, // Right Click
      },
    ],
  });

  const { metaDataManager } = cornerstoneDICOMImageLoader.wadors;

  // Get Cornerstone imageIds and fetch metadata into RAM
  let imageIds = await createImageIdsAndCacheMetaData({
    StudyInstanceUID: '2.25.79767489559005369769092179787138169587',
    SeriesInstanceUID: '2.25.87977716979310885152986847054790859463',
    wadoRsRoot: 'https://d14fa38qiwhyfd.cloudfront.net/dicomweb',
  });

  const firstDimensionGroup = 10;
  const lastDimensionGroup = 14;
  const NUM_IMAGES_PER_DIMENSION_GROUP = 235;
  const firstInstanceNumber =
    (firstDimensionGroup - 1) * NUM_IMAGES_PER_DIMENSION_GROUP + 1;
  const lastInstanceNumber =
    lastDimensionGroup * NUM_IMAGES_PER_DIMENSION_GROUP;

  imageIds = imageIds.filter((imageId) => {
    const instanceMetaData = metaDataManager.get(imageId);
    const instanceTag = instanceMetaData['00200013'];
    const instanceNumber = parseInt(instanceTag.Value[0]);

    return (
      instanceNumber >= firstInstanceNumber &&
      instanceNumber <= lastInstanceNumber
    );
  });

  // Instantiate a rendering engine
  renderingEngine = new RenderingEngine(renderingEngineId);

  // Create a viewport
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

  computedVolume = volumeLoader.createAndCacheDerivedLabelmapVolume(volumeId, {
    volumeId: computedVolumeId,
  });

  // Set the volume to load
  volume.load();

  volumeForButton = volume;
  addTextInputBox();
  addDimensionGroupSlider(volume);

  // Set the volume on the viewport
  viewport.setVolumes([{ volumeId }]);

  // Render the image
  viewport.render();
  viewport2.render();
}
run();
