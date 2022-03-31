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
  setCtTransferFunctionForVolumeActor,
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
  MIPJumpToClickTool,
  VolumeRotateMouseWheelTool,
  CrosshairsTool,
} = cornerstoneTools;

const { MouseBindings } = csToolsEnums;
const { ViewportType, BlendModes } = Enums;
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
const ctPtToolGroupId = 'CT_PT_TOOLGROUP_ID';
const fusionToolGroupId = 'FUSION_TOOLGROUP_ID';
const mipToolGroupUID = 'MIP_TOOLGROUP_ID';

const viewportIds = {
  CT: { AXIAL: 'CT_AXIAL', SAGITTAL: 'CT_SAGITTAL', CORONAL: 'CT_CORONAL' },
  PT: { AXIAL: 'PT_AXIAL', SAGITTAL: 'PT_SAGITTAL', CORONAL: 'PT_CORONAL' },
  FUSION: {
    AXIAL: 'FUSION_AXIAL',
    SAGITTAL: 'FUSION_SAGITTAL',
    CORONAL: 'FUSION_CORONAL',
  },
  PETMIP: {
    CORONAL: 'PET_MIP_CORONAL',
  },
};

// ======== Set up page ======== //
setTitleAndDescription(
  'PET-CT',
  'PT CT 3x3 + MIP layout with Crosshairs, and synchronizers cameras, CT W/L and PET threshold'
);

const size = '250px';

const viewportGrid = document.createElement('div');

viewportGrid.style.display = 'grid';
viewportGrid.style.gridTemplateRows = `[row1-start] ${size} [row2-start] ${size} [row3-start] ${size} [end]`;
viewportGrid.style.gridTemplateRows = `[col1-start] ${size} [col2-start] ${size} [col3-start] ${size} [col4-start] ${size} [end]`;
viewportGrid.style.width = '750px';

const content = document.getElementById('content');

content.appendChild(viewportGrid);

const element1_1 = document.createElement('div');
const element1_2 = document.createElement('div');
const element1_3 = document.createElement('div');
const element2_1 = document.createElement('div');
const element2_2 = document.createElement('div');
const element2_3 = document.createElement('div');
const element3_1 = document.createElement('div');
const element3_2 = document.createElement('div');
const element3_3 = document.createElement('div');
const element_mip = document.createElement('div');

// Place main 3x3 viewports
element1_1.style.gridColumnStart = '1';
element1_1.style.gridRowStart = '1';
element1_2.style.gridColumnStart = '2';
element1_2.style.gridRowStart = '1';
element1_3.style.gridColumnStart = '3';
element1_3.style.gridRowStart = '1';
element2_1.style.gridColumnStart = '1';
element2_1.style.gridRowStart = '2';
element2_2.style.gridColumnStart = '2';
element2_2.style.gridRowStart = '2';
element2_3.style.gridColumnStart = '3';
element2_3.style.gridRowStart = '2';
element3_1.style.gridColumnStart = '1';
element3_1.style.gridRowStart = '3';
element3_2.style.gridColumnStart = '2';
element3_2.style.gridRowStart = '3';
element3_3.style.gridColumnStart = '3';
element3_3.style.gridRowStart = '3';

// Place MIP viewport
element_mip.style.gridColumnStart = '4';
element_mip.style.gridRowStart = '1';
element_mip.style.gridRowEnd = 'span 3';

viewportGrid.appendChild(element1_1);
viewportGrid.appendChild(element1_2);
viewportGrid.appendChild(element1_3);
viewportGrid.appendChild(element2_1);
viewportGrid.appendChild(element2_2);
viewportGrid.appendChild(element2_3);
viewportGrid.appendChild(element3_1);
viewportGrid.appendChild(element3_2);
viewportGrid.appendChild(element3_3);
viewportGrid.appendChild(element_mip);

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

element_mip.style.width = '250px';
element_mip.style.height = '750px';
element_mip.oncontextmenu = (e) => e.preventDefault();

// ============================= //

const viewportColors = {
  [viewportIds.CT.AXIAL]: 'rgb(200, 0, 0)',
  [viewportIds.CT.SAGITTAL]: 'rgb(200, 200, 0)',
  [viewportIds.CT.CORONAL]: 'rgb(0, 200, 0)',
  [viewportIds.PT.AXIAL]: 'rgb(200, 0, 0)',
  [viewportIds.PT.SAGITTAL]: 'rgb(200, 200, 0)',
  [viewportIds.PT.CORONAL]: 'rgb(0, 200, 0)',
  [viewportIds.FUSION.AXIAL]: 'rgb(200, 0, 0)',
  [viewportIds.FUSION.SAGITTAL]: 'rgb(200, 200, 0)',
  [viewportIds.FUSION.CORONAL]: 'rgb(0, 200, 0)',
};

const viewportReferenceLineControllable = [
  viewportIds.CT.AXIAL,
  viewportIds.CT.SAGITTAL,
  viewportIds.CT.CORONAL,
  viewportIds.PT.AXIAL,
  viewportIds.PT.SAGITTAL,
  viewportIds.PT.CORONAL,
  viewportIds.FUSION.AXIAL,
  viewportIds.FUSION.SAGITTAL,
  viewportIds.FUSION.CORONAL,
];

const viewportReferenceLineDraggableRotatable = [
  viewportIds.CT.AXIAL,
  viewportIds.CT.SAGITTAL,
  viewportIds.CT.CORONAL,
  viewportIds.PT.AXIAL,
  viewportIds.PT.SAGITTAL,
  viewportIds.PT.CORONAL,
  viewportIds.FUSION.AXIAL,
  viewportIds.FUSION.SAGITTAL,
  viewportIds.FUSION.CORONAL,
];

const viewportReferenceLineSlabThicknessControlsOn = [
  viewportIds.CT.AXIAL,
  viewportIds.CT.SAGITTAL,
  viewportIds.CT.CORONAL,
  viewportIds.PT.AXIAL,
  viewportIds.PT.SAGITTAL,
  viewportIds.PT.CORONAL,
  viewportIds.FUSION.AXIAL,
  viewportIds.FUSION.SAGITTAL,
  viewportIds.FUSION.CORONAL,
];

function getReferenceLineColor(viewportId) {
  return viewportColors[viewportId];
}

function getReferenceLineControllable(viewportId) {
  const index = viewportReferenceLineControllable.indexOf(viewportId);
  return index !== -1;
}

function getReferenceLineDraggableRotatable(viewportId) {
  const index = viewportReferenceLineDraggableRotatable.indexOf(viewportId);
  return index !== -1;
}

function getReferenceLineSlabThicknessControlsOn(viewportId) {
  const index =
    viewportReferenceLineSlabThicknessControlsOn.indexOf(viewportId);
  return index !== -1;
}

function setUpToolGroups() {
  // Add tools to Cornerstone3D
  cornerstoneTools.addTool(WindowLevelTool);
  cornerstoneTools.addTool(PanTool);
  cornerstoneTools.addTool(ZoomTool);
  cornerstoneTools.addTool(StackScrollMouseWheelTool);
  cornerstoneTools.addTool(MIPJumpToClickTool);
  cornerstoneTools.addTool(VolumeRotateMouseWheelTool);
  cornerstoneTools.addTool(CrosshairsTool);

  // Define tool groups for the main 9 viewports.
  // We need two tool groups for the main viewports as we want to specify for the fusion which volume
  // to control with the window/level tool. For the CT and PT, we can use the
  // default, which is the first (and only) volume present
  const ctPtToolGroup = ToolGroupManager.createToolGroup(ctPtToolGroupId);
  const fusionToolGroup = ToolGroupManager.createToolGroup(fusionToolGroupId);

  ctPtToolGroup.addViewport(viewportIds.CT.AXIAL, renderingEngineId);
  ctPtToolGroup.addViewport(viewportIds.CT.SAGITTAL, renderingEngineId);
  ctPtToolGroup.addViewport(viewportIds.CT.CORONAL, renderingEngineId);
  ctPtToolGroup.addViewport(viewportIds.PT.AXIAL, renderingEngineId);
  ctPtToolGroup.addViewport(viewportIds.PT.SAGITTAL, renderingEngineId);
  ctPtToolGroup.addViewport(viewportIds.PT.CORONAL, renderingEngineId);
  fusionToolGroup.addViewport(viewportIds.FUSION.AXIAL, renderingEngineId);
  fusionToolGroup.addViewport(viewportIds.FUSION.SAGITTAL, renderingEngineId);
  fusionToolGroup.addViewport(viewportIds.FUSION.CORONAL, renderingEngineId);

  // Manipulation Tools
  [ctPtToolGroup, fusionToolGroup].forEach((toolGroup) => {
    toolGroup.addTool(PanTool.toolName);
    toolGroup.addTool(ZoomTool.toolName);
    toolGroup.addTool(StackScrollMouseWheelTool.toolName);
    toolGroup.addTool(CrosshairsTool.toolName, {
      getReferenceLineColor,
      getReferenceLineControllable,
      getReferenceLineDraggableRotatable,
      getReferenceLineSlabThicknessControlsOn,
    });
  });

  // Here is the difference in the toolgroups used, that we need to specify the
  // volume to use for the WindowLevelTool for the fusion viewports
  ctPtToolGroup.addTool(WindowLevelTool.toolName);
  fusionToolGroup.addTool(WindowLevelTool.toolName, {
    volumeId: ptVolumeId,
  });

  [ctPtToolGroup, fusionToolGroup].forEach((toolGroup) => {
    // toolGroup.setToolActive(WindowLevelTool.toolName, {
    //   bindings: [
    //     {
    //       mouseButton: MouseBindings.Primary, // Left Click
    //     },
    //   ],
    // });
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

    toolGroup.setToolActive(StackScrollMouseWheelTool.toolName);
    toolGroup.setToolEnabled(CrosshairsTool.toolName, {
      bindings: [
        {
          mouseButton: MouseBindings.Primary,
        },
      ],
    });
  });

  // MIP Tool Groups
  const mipToolGroup = ToolGroupManager.createToolGroup(mipToolGroupUID);

  mipToolGroup.addTool('VolumeRotateMouseWheel');
  mipToolGroup.addTool('MIPJumpToClickTool', {
    targetViewportIds: [
      viewportIds.CT.AXIAL,
      viewportIds.CT.SAGITTAL,
      viewportIds.CT.CORONAL,
      viewportIds.PT.AXIAL,
      viewportIds.PT.SAGITTAL,
      viewportIds.PT.CORONAL,
      viewportIds.FUSION.AXIAL,
      viewportIds.FUSION.SAGITTAL,
      viewportIds.FUSION.CORONAL,
    ],
  });

  // Set the initial state of the tools, here we set one tool active on left click.
  // This means left click will draw that tool.
  mipToolGroup.setToolActive('MIPJumpToClickTool', {
    bindings: [
      {
        mouseButton: MouseBindings.Primary, // Left Click
      },
    ],
  });
  // As the Stack Scroll mouse wheel is a tool using the `mouseWheelCallback`
  // hook instead of mouse buttons, it does not need to assign any mouse button.
  mipToolGroup.setToolActive('VolumeRotateMouseWheel');

  mipToolGroup.addViewport(viewportIds.PETMIP.CORONAL, renderingEngineId);
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
    viewportIds.PETMIP.CORONAL,
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
    {
      viewportId: viewportIds.PETMIP.CORONAL,
      type: ViewportType.ORTHOGRAPHIC,
      element: element_mip,
      defaultOptions: {
        orientation: ORIENTATION.CORONAL,
        background: <Types.Point3>[1, 1, 1],
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
    [{ volumeId: ctVolumeId, callback: setCtTransferFunctionForVolumeActor }],
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
      { volumeId: ctVolumeId, callback: setCtTransferFunctionForVolumeActor },
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

  // Calculate size of fullBody pet mip
  const ptVolumeDimensions = ptVolume.dimensions;

  // Only make the MIP as large as it needs to be.
  const slabThickness = Math.sqrt(
    ptVolumeDimensions[0] * ptVolumeDimensions[0] +
      ptVolumeDimensions[1] * ptVolumeDimensions[1] +
      ptVolumeDimensions[2] * ptVolumeDimensions[2]
  );

  setVolumesForViewports(
    renderingEngine,
    [
      {
        volumeId: ptVolumeId,
        callback: setPetTransferFunctionForVolumeActor,
        blendMode: BlendModes.MAXIMUM_INTENSITY_BLEND,
        slabThickness,
      },
    ],
    [viewportIds.PETMIP.CORONAL]
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
