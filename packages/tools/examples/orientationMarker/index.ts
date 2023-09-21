import {
  metaData,
  RenderingEngine,
  Types,
  Enums,
  volumeLoader,
  setVolumesForViewports,
} from '@cornerstonejs/core';
import {
  initDemo,
  createImageIdsAndCacheMetaData,
  setCtTransferFunctionForVolumeActor,
  setTitleAndDescription,
} from '../../../../utils/demo/helpers';
import * as cornerstoneTools from '@cornerstonejs/tools';
import { sortImageIdsAndGetSpacing } from '../../../streaming-image-volume-loader/src/helpers';
import { vec3 } from 'gl-matrix';

/**
 * Calculates the plane normal given the image orientation vector
 * @param imageOrientation
 * @returns
 */
function calculatePlaneNormal(imageOrientation) {
  const rowCosineVec = vec3.fromValues(
    imageOrientation[0],
    imageOrientation[1],
    imageOrientation[2]
  );
  const colCosineVec = vec3.fromValues(
    imageOrientation[3],
    imageOrientation[4],
    imageOrientation[5]
  );
  return vec3.cross(vec3.create(), rowCosineVec, colCosineVec);
}

function sortImageIds(imageIds) {
  const { imageOrientationPatient } = metaData.get(
    'imagePlaneModule',
    imageIds[0]
  );
  const scanAxisNormal = calculatePlaneNormal(imageOrientationPatient);
  const { sortedImageIds } = sortImageIdsAndGetSpacing(
    imageIds,
    scanAxisNormal
  );
  return sortedImageIds;
}

async function getImageStacks() {
  // Get Cornerstone imageIds for the source data and fetch metadata into RAM
  const wadoRsRoot = 'https://d33do7qe4w26qo.cloudfront.net/dicomweb';
  const studyInstanceUID =
    '1.3.6.1.4.1.25403.345050719074.3824.20170125095258.1';
  const seriesInstanceUIDs = [
    '1.3.6.1.4.1.25403.345050719074.3824.20170125095258.7',
    '1.3.6.1.4.1.25403.345050719074.3824.20170125095319.5',
    '1.3.6.1.4.1.25403.345050719074.3824.20170125095312.3',
  ];
  const axialImageIds = await createImageIdsAndCacheMetaData({
    StudyInstanceUID: studyInstanceUID,
    SeriesInstanceUID: seriesInstanceUIDs[0],
    wadoRsRoot,
  });

  const sagittalImageIds = await createImageIdsAndCacheMetaData({
    StudyInstanceUID: studyInstanceUID,
    SeriesInstanceUID: seriesInstanceUIDs[1],
    wadoRsRoot,
  });

  const coronalImageIds = await createImageIdsAndCacheMetaData({
    StudyInstanceUID: studyInstanceUID,
    SeriesInstanceUID: seriesInstanceUIDs[2],
    wadoRsRoot,
  });

  const imageStacks = [
    sortImageIds(axialImageIds),
    sortImageIds(sagittalImageIds),
    sortImageIds(coronalImageIds),
  ];
  return imageStacks;
}
// This is for debugging purposes
console.warn(
  'Click on index.ts to open source code for this example --------->'
);

const {
  ToolGroupManager,
  Enums: csToolsEnums,
  OrientationMarkerTool,
  ZoomTool,
  PanTool,
  TrackballRotateTool,
} = cornerstoneTools;

const { MouseBindings } = csToolsEnums;
const { ViewportType } = Enums;

// Define a unique id for the volume
const volumeName = 'CT_VOLUME_ID'; // Id of the volume less loader prefix
const volumeLoaderScheme = 'cornerstoneStreamingImageVolume'; // Loader id which defines which volume loader to use
const volumeId = `${volumeLoaderScheme}:${volumeName}`; // VolumeId with loader id + volume id
const toolGroupId = 'MY_TOOLGROUP_ID';

// ======== Set up page ======== //
setTitleAndDescription(
  'OverlayGrid',
  'Here we demonstrate overlay grid tool working. The reference lines for all the images in axial series is displayed in the sagittal and coronal series.'
);

const size = '500px';
const content = document.getElementById('content');
const viewportGrid = document.createElement('div');

viewportGrid.style.display = 'flex';
viewportGrid.style.display = 'flex';
viewportGrid.style.flexDirection = 'row';

const elements = [];
const numberOfElements = 3;
for (let i = 0; i < numberOfElements; i++) {
  const element = document.createElement('div');
  element.style.width = size;
  element.style.height = size;
  // Disable right click context menu so we can have right click tools
  element.oncontextmenu = (e) => e.preventDefault();
  viewportGrid.appendChild(element);
  elements.push(element);
}

content.appendChild(viewportGrid);

const instructions = document.createElement('p');
instructions.innerText = `
  `;

content.append(instructions);

// ============================= //
// this variable controls if the viewport is a VolumeViewport or StackViewport
const useVolume = true;

const viewportIds = ['CT_AXIAL', 'CT_SAGITTAL', 'CT_CORONAL'].slice(
  0,
  numberOfElements
);

const renderingEngineId = 'myRenderingEngine';

/**
 * Runs the demo
 */
async function run() {
  // Define tool groups to add the segmentation display tool to
  const toolGroup = ToolGroupManager.createToolGroup(toolGroupId);

  // Init Cornerstone and related libraries
  await initDemo();

  // Add tools to Cornerstone3D
  cornerstoneTools.addTool(OrientationMarkerTool);
  cornerstoneTools.addTool(PanTool);
  cornerstoneTools.addTool(ZoomTool);
  cornerstoneTools.addTool(TrackballRotateTool);

  toolGroup.addTool(OrientationMarkerTool.toolName, {
    overlayMarkerType: 3,
    polyDataURL: '/Human.vtp',
  });

  toolGroup.addTool(ZoomTool.toolName);
  toolGroup.addTool(PanTool.toolName);
  toolGroup.addTool(TrackballRotateTool.toolName);

  toolGroup.setToolActive(TrackballRotateTool.toolName, {
    bindings: [
      {
        mouseButton: MouseBindings.Primary, // Left Click
      },
    ],
  });

  // Instantiate a rendering engine
  const renderingEngine = new RenderingEngine(renderingEngineId);

  // Create the viewports
  const viewportInputArray = [
    {
      viewportId: viewportIds[0],
      type: ViewportType.ORTHOGRAPHIC,
      element: elements[0],
      defaultOptions: {
        orientation: Enums.OrientationAxis.AXIAL,
      },
    },
    {
      viewportId: viewportIds[1],
      type: ViewportType.ORTHOGRAPHIC,
      element: elements[1],
      defaultOptions: {
        orientation: Enums.OrientationAxis.SAGITTAL,
      },
    },
    {
      viewportId: viewportIds[2],
      type: ViewportType.ORTHOGRAPHIC,
      element: elements[2],
      defaultOptions: {
        orientation: Enums.OrientationAxis.CORONAL,
      },
    },
  ];

  renderingEngine.setViewports(viewportInputArray);

  const usedViewportIds = viewportInputArray.map(
    ({ viewportId }) => viewportId
  );
  // Add tools to the viewports
  usedViewportIds.map(({ viewportId }) => {
    toolGroup.addViewport(viewportId, renderingEngineId);
  });

  const imageStacks = await getImageStacks();

  // Define a volume in memory
  const volume = await volumeLoader.createAndCacheVolume(volumeId, {
    imageIds: imageStacks[0],
  });
  volume.load();

  await setVolumesForViewports(
    renderingEngine,
    [
      {
        volumeId,
        callback: setCtTransferFunctionForVolumeActor,
        blendMode: Enums.BlendModes.MAXIMUM_INTENSITY_BLEND,
        slabThickness: 10000,
      },
    ],
    usedViewportIds
  );

  // Todo: Handle this
  toolGroup.setToolActive(OrientationMarkerTool.toolName);

  // Render the image
  renderingEngine.render();
}

run();
