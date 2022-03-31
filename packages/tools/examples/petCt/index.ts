import {
  RenderingEngine,
  Types,
  Enums,
  setVolumesForViewports,
  volumeLoader,
  CONSTANTS,
} from '@cornerstonejs/core';
import {
  initDemo,
  createImageIdsAndCacheMetaData,
  setTitleAndDescription,
  setPetColorMapTransferFunctionForVolumeActor,
  setPetTransferFunctionForVolumeActor,
} from '../../../../utils/demo/helpers';
import * as cornerstoneTools from '@cornerstonejs/tools';

const {
  ToolGroupManager,
  Enums: csToolsEnums,
  WindowLevelTool,
  PanTool,
  ZoomTool,
  StackScrollMouseWheelTool,
  synchronizers,
} = cornerstoneTools;

const { MouseBindings } = csToolsEnums;
const { ViewportType } = Enums;
const { ORIENTATION } = CONSTANTS;

const { createCameraPositionSynchronizer, createVOISynchronizer } =
  synchronizers;

let renderingEngine;
const renderingEngineId = 'myRenderingEngine';
const volumeLoaderProtocolName = 'cornerstoneStreamingImageVolume'; // Loader id which defines which volume loader to use
const ctVolumeName = 'CT_VOLUME_ID'; // Id of the volume less loader prefix
const ctVolumeId = `${volumeLoaderProtocolName}:${ctVolumeName}`; // VolumeId with loader id + volume id
const ptVolumeName = 'PT_VOLUME_ID';
const ptVolumeId = `${volumeLoaderProtocolName}:${ptVolumeName}`;
const toolGroupId = 'MY_TOOLGROUP_ID';

const viewportIds = {
  CT: { AXIAL: 'CT_AXIAL', SAGITTAL: 'CT_SAGITTAL', CORONAL: 'CT_CORONAL' },
  PT: { AXIAL: 'PT_AXIAL', SAGITTAL: 'PT_SAGITTAL', CORONAL: 'PT_CORONAL' },
  FUSION: {
    AXIAL: 'FUSION_AXIAL',
    SAGITTAL: 'FUSION_SAGITTAL',
    CORONAL: 'FUSION_CORONAL',
  },
};

// ======== Set up page ======== //
setTitleAndDescription(
  'PET-CT',
  'PT CT 3x3 + MIP layout with Crosshairs, and synchronizers cameras, CT W/L and PET threshold'
);

const size = '250px';
const content = document.getElementById('content');

const row1 = document.createElement('div');
const row2 = document.createElement('div');
const row3 = document.createElement('div');

const rows = [row1, row2, row3];

rows.forEach((row) => {
  row.style.display = 'flex';
  row1.style.flexDirection = 'row';
});

content.appendChild(row1);
content.appendChild(row2);
content.appendChild(row3);

const element1_1 = document.createElement('div');
const element1_2 = document.createElement('div');
const element1_3 = document.createElement('div');
const element2_1 = document.createElement('div');
const element2_2 = document.createElement('div');
const element2_3 = document.createElement('div');
const element3_1 = document.createElement('div');
const element3_2 = document.createElement('div');
const element3_3 = document.createElement('div');

row1.appendChild(element1_1);
row1.appendChild(element1_2);
row1.appendChild(element1_3);
row2.appendChild(element2_1);
row2.appendChild(element2_2);
row2.appendChild(element2_3);
row3.appendChild(element3_1);
row3.appendChild(element3_2);
row3.appendChild(element3_3);

const elements = [
  element1_1,
  element1_2,
  element1_3,
  element2_1,
  element2_2,
  element2_3,
  element3_1,
  element3_2,
  element3_3,
];

elements.forEach((element) => {
  element.style.width = size;
  element.style.height = size;
  // Disable right click context menu so we can have right click tools
  element.oncontextmenu = (e) => e.preventDefault();
});

// ============================= //

function setUpToolGroups() {
  // Add tools to Cornerstone3D
  cornerstoneTools.addTool(WindowLevelTool);
  cornerstoneTools.addTool(PanTool);
  cornerstoneTools.addTool(ZoomTool);
  cornerstoneTools.addTool(StackScrollMouseWheelTool);

  // Define tool groups to add the segmentation display tool to
  const toolGroup = ToolGroupManager.createToolGroup(toolGroupId);

  // Manipulation Tools
  toolGroup.addTool(WindowLevelTool.toolName);
  toolGroup.addTool(PanTool.toolName);
  toolGroup.addTool(ZoomTool.toolName);
  toolGroup.addTool(StackScrollMouseWheelTool.toolName);

  toolGroup.setToolActive(WindowLevelTool.toolName, {
    bindings: [
      {
        mouseButton: MouseBindings.Primary, // Middle Click
      },
    ],
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
  // As the Stack Scroll mouse wheel is a tool using the `mouseWheelCallback`
  // hook instead of mouse buttons, it does not need to assign any mouse button.
  toolGroup.setToolActive(StackScrollMouseWheelTool.toolName);

  toolGroup.addViewport(viewportIds.CT.AXIAL, renderingEngineId);
  toolGroup.addViewport(viewportIds.CT.SAGITTAL, renderingEngineId);
  toolGroup.addViewport(viewportIds.CT.CORONAL, renderingEngineId);
  toolGroup.addViewport(viewportIds.PT.AXIAL, renderingEngineId);
  toolGroup.addViewport(viewportIds.PT.SAGITTAL, renderingEngineId);
  toolGroup.addViewport(viewportIds.PT.CORONAL, renderingEngineId);
  toolGroup.addViewport(viewportIds.FUSION.AXIAL, renderingEngineId);
  toolGroup.addViewport(viewportIds.FUSION.SAGITTAL, renderingEngineId);
  toolGroup.addViewport(viewportIds.FUSION.CORONAL, renderingEngineId);
}

function setUpSynchronizers() {
  const axialCameraSynchronizerId = 'AXIAL_CAMERA_SYNCHRONIZER_ID';
  const sagittalCameraSynchronizerId = 'SAGITTAL_CAMERA_SYNCHRONIZER_ID';
  const coronalCameraSynchronizerId = 'CORONAL_CAMERA_SYNCHRONIZER_ID';
  const ctVoiSynchronizerId = 'CT_VOI_SYNCHRONIZER_ID';
  const ptVoiSynchronizerId = 'PT_VOI_SYNCHRONIZER_ID';

  const axialCameraPositionSynchronizer = createCameraPositionSynchronizer(
    axialCameraSynchronizerId
  );
  const sagittalCameraPositionSynchronizer = createCameraPositionSynchronizer(
    sagittalCameraSynchronizerId
  );
  const coronalCameraPositionSynchronizer = createCameraPositionSynchronizer(
    coronalCameraSynchronizerId
  );
  const ctVoiSynchronizer = createVOISynchronizer(ctVoiSynchronizerId);
  const ptVoiSynchronizer = createVOISynchronizer(ptVoiSynchronizerId);

  // Add viewports to camera synchronizers
  [
    viewportIds.CT.AXIAL,
    viewportIds.PT.AXIAL,
    viewportIds.FUSION.AXIAL,
  ].forEach((viewportId) => {
    axialCameraPositionSynchronizer.add({
      renderingEngineId,
      viewportId,
    });
  });
  [
    viewportIds.CT.SAGITTAL,
    viewportIds.PT.SAGITTAL,
    viewportIds.FUSION.SAGITTAL,
  ].forEach((viewportId) => {
    sagittalCameraPositionSynchronizer.add({
      renderingEngineId,
      viewportId,
    });
  });
  [
    viewportIds.CT.CORONAL,
    viewportIds.PT.CORONAL,
    viewportIds.FUSION.CORONAL,
  ].forEach((viewportId) => {
    coronalCameraPositionSynchronizer.add({
      renderingEngineId,
      viewportId,
    });
  });

  // Add viewports to VOI synchronizers
  [
    viewportIds.CT.AXIAL,
    viewportIds.CT.SAGITTAL,
    viewportIds.CT.CORONAL,
  ].forEach((viewportId) => {
    ctVoiSynchronizer.add({
      renderingEngineId,
      viewportId,
    });
  });
  [
    viewportIds.FUSION.AXIAL,
    viewportIds.FUSION.SAGITTAL,
    viewportIds.FUSION.CORONAL,
  ].forEach((viewportId) => {
    // In this example, the fusion viewports are only targets for CT VOI
    // synchronization, not sources
    ctVoiSynchronizer.addTarget({
      renderingEngineId,
      viewportId,
    });
  });
  [
    viewportIds.PT.AXIAL,
    viewportIds.PT.SAGITTAL,
    viewportIds.PT.CORONAL,
    viewportIds.FUSION.AXIAL,
    viewportIds.FUSION.SAGITTAL,
    viewportIds.FUSION.CORONAL,
  ].forEach((viewportId) => {
    ptVoiSynchronizer.add({
      renderingEngineId,
      viewportId,
    });
  });
}

async function setUpDisplay() {
  const wadoRsRoot = 'https://server.dcmjs.org/dcm4chee-arc/aets/DCM4CHEE/rs';
  const StudyInstanceUID =
    '1.3.6.1.4.1.14519.5.2.1.7009.2403.334240657131972136850343327463';

  // Get Cornerstone imageIds and fetch metadata into RAM
  const ctImageIds = await createImageIdsAndCacheMetaData({
    StudyInstanceUID,
    SeriesInstanceUID:
      '1.3.6.1.4.1.14519.5.2.1.7009.2403.226151125820845824875394858561',
    wadoRsRoot,
    type: 'VOLUME',
  });

  const ptImageIds = await createImageIdsAndCacheMetaData({
    StudyInstanceUID,
    SeriesInstanceUID:
      '1.3.6.1.4.1.14519.5.2.1.7009.2403.879445243400782656317561081015',
    wadoRsRoot,
    type: 'VOLUME',
  });

  // Define a volume in memory
  const ctVolume = await volumeLoader.createAndCacheVolume(ctVolumeId, {
    imageIds: ctImageIds,
  });
  // Define a volume in memory
  const ptVolume = await volumeLoader.createAndCacheVolume(ptVolumeId, {
    imageIds: ptImageIds,
  });

  // Create the viewports

  const viewportInputArray = [
    {
      viewportId: viewportIds.CT.AXIAL,
      type: ViewportType.ORTHOGRAPHIC,
      element: element1_1,
      defaultOptions: {
        orientation: ORIENTATION.AXIAL,
      },
    },
    {
      viewportId: viewportIds.CT.SAGITTAL,
      type: ViewportType.ORTHOGRAPHIC,
      element: element1_2,
      defaultOptions: {
        orientation: ORIENTATION.SAGITTAL,
      },
    },
    {
      viewportId: viewportIds.CT.CORONAL,
      type: ViewportType.ORTHOGRAPHIC,
      element: element1_3,
      defaultOptions: {
        orientation: ORIENTATION.CORONAL,
      },
    },
    {
      viewportId: viewportIds.PT.AXIAL,
      type: ViewportType.ORTHOGRAPHIC,
      element: element2_1,
      defaultOptions: {
        orientation: ORIENTATION.AXIAL,
        background: <Types.Point3>[1, 1, 1],
      },
    },
    {
      viewportId: viewportIds.PT.SAGITTAL,
      type: ViewportType.ORTHOGRAPHIC,
      element: element2_2,
      defaultOptions: {
        orientation: ORIENTATION.SAGITTAL,
        background: <Types.Point3>[1, 1, 1],
      },
    },
    {
      viewportId: viewportIds.PT.CORONAL,
      type: ViewportType.ORTHOGRAPHIC,
      element: element2_3,
      defaultOptions: {
        orientation: ORIENTATION.CORONAL,
        background: <Types.Point3>[1, 1, 1],
      },
    },
    {
      viewportId: viewportIds.FUSION.AXIAL,
      type: ViewportType.ORTHOGRAPHIC,
      element: element3_1,
      defaultOptions: {
        orientation: ORIENTATION.AXIAL,
      },
    },
    {
      viewportId: viewportIds.FUSION.SAGITTAL,
      type: ViewportType.ORTHOGRAPHIC,
      element: element3_2,
      defaultOptions: {
        orientation: ORIENTATION.SAGITTAL,
      },
    },
    {
      viewportId: viewportIds.FUSION.CORONAL,
      type: ViewportType.ORTHOGRAPHIC,
      element: element3_3,
      defaultOptions: {
        orientation: ORIENTATION.CORONAL,
      },
    },
  ];

  renderingEngine.setViewports(viewportInputArray);

  // Set the volumes to load
  ptVolume.load();
  ctVolume.load();

  // Set volumes on the viewports
  await setVolumesForViewports(
    renderingEngine,
    [{ volumeId: ctVolumeId }],
    [viewportIds.CT.AXIAL, viewportIds.CT.SAGITTAL, viewportIds.CT.CORONAL]
  );

  await setVolumesForViewports(
    renderingEngine,
    [{ volumeId: ptVolumeId, callback: setPetTransferFunctionForVolumeActor }],
    [viewportIds.PT.AXIAL, viewportIds.PT.SAGITTAL, viewportIds.PT.CORONAL]
  );

  await setVolumesForViewports(
    renderingEngine,
    [
      { volumeId: ctVolumeId },
      {
        volumeId: ptVolumeId,
        callback: setPetColorMapTransferFunctionForVolumeActor,
      },
    ],
    [
      viewportIds.FUSION.AXIAL,
      viewportIds.FUSION.SAGITTAL,
      viewportIds.FUSION.CORONAL,
    ]
  );

  // Render the viewports
  renderingEngine.render();
}

/**
 * Runs the demo
 */
async function run() {
  // Init Cornerstone and related libraries
  await initDemo();

  // Instantiate a rendering engine
  renderingEngine = new RenderingEngine(renderingEngineId);

  // Display needs to be set up first so that we have viewport to reference for tools and synchronizers.
  await setUpDisplay();
  // Tools and synchronizers can be set up in any order.
  setUpToolGroups();
  setUpSynchronizers();
}

run();
