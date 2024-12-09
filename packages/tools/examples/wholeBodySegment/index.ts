import type { Types } from '@cornerstonejs/core';
import {
  RenderingEngine,
  Enums,
  setVolumesForViewports,
  volumeLoader,
  getRenderingEngine,
  cache,
} from '@cornerstonejs/core';
import {
  initDemo,
  createImageIdsAndCacheMetaData,
  setTitleAndDescription,
  setPetTransferFunctionForVolumeActor,
  setCtTransferFunctionForVolumeActor,
  addButtonToToolbar,
  createInfoSection,
} from '../../../../utils/demo/helpers';
import * as cornerstoneTools from '@cornerstonejs/tools';

const DEFAULT_SEGMENT_CONFIG = {
  fillAlpha: 0.1,
  outlineOpacity: 1,
  outlineWidthActive: 3,
};

const {
  ToolGroupManager,
  Enums: csToolsEnums,
  PanTool,
  ZoomTool,
  StackScrollMouseWheelTool,
  synchronizers,
  WholeBodySegmentTool,
  SegmentationDisplayTool,
  segmentation,
} = cornerstoneTools;

const { MouseBindings } = csToolsEnums;
const { ViewportType } = Enums;

const { createCameraPositionSynchronizer, createVOISynchronizer } =
  synchronizers;

let renderingEngine;
const wadoRsRoot = 'https://d3t6nz73ql33tx.cloudfront.net/dicomweb';
const StudyInstanceUID =
  '1.3.6.1.4.1.14519.5.2.1.7009.2403.334240657131972136850343327463';
const renderingEngineId = 'myRenderingEngine';
const volumeLoaderScheme = 'cornerstoneStreamingImageVolume'; // Loader id which defines which volume loader to use
const ctVolumeName = 'CT_VOLUME_ID'; // Id of the volume less loader prefix
const ctVolumeId = `${volumeLoaderScheme}:${ctVolumeName}`; // VolumeId with loader id + volume id
const ptVolumeName = 'PT_VOLUME_ID';
const ptVolumeId = `${volumeLoaderScheme}:${ptVolumeName}`;
const ctToolGroupId = 'CT_TOOLGROUP_ID';
const ptToolGroupId = 'PT_TOOLGROUP_ID';
let ctImageIds;
let ptImageIds;
let ctVolume;
let ptVolume;
const axialCameraSynchronizerId = 'AXIAL_CAMERA_SYNCHRONIZER_ID';
const sagittalCameraSynchronizerId = 'SAGITTAL_CAMERA_SYNCHRONIZER_ID';
const coronalCameraSynchronizerId = 'CORONAL_CAMERA_SYNCHRONIZER_ID';
const ctVoiSynchronizerId = 'CT_VOI_SYNCHRONIZER_ID';
const ptVoiSynchronizerId = 'PT_VOI_SYNCHRONIZER_ID';
let axialCameraPositionSynchronizer;
let sagittalCameraPositionSynchronizer;
let coronalCameraPositionSynchronizer;
let ctVoiSynchronizer;
let ptVoiSynchronizer;
const viewportIds = {
  CT: { AXIAL: 'CT_AXIAL', SAGITTAL: 'CT_SAGITTAL', CORONAL: 'CT_CORONAL' },
  PT: { AXIAL: 'PT_AXIAL', SAGITTAL: 'PT_SAGITTAL', CORONAL: 'PT_CORONAL' },
};
const segmentationId = 'MY_SEGMENTATION_ID';

// ======== Set up page ======== //
setTitleAndDescription(
  'Whole Body Segment Tool',
  'Demonstrates how to segment the whole body of a region selected by the user that is processed in the gpu (grow cut algorithm)'
);

addButtonToToolbar({
  title: 'Clear segmentation',
  onClick: async () => {
    const labelmapVolume = cache.getVolume(segmentationId);
    const labelmapData = labelmapVolume.getScalarData();

    labelmapData.fill(0);
    segmentation.triggerSegmentationEvents.triggerSegmentationDataModified(
      segmentationId
    );
  },
});

const resizeObserver = new ResizeObserver(() => {
  renderingEngine = getRenderingEngine(renderingEngineId);

  if (renderingEngine) {
    renderingEngine.resize(true, false);
  }
});

const viewportGrid = document.createElement('div');

viewportGrid.style.display = 'grid';
viewportGrid.style.gridTemplateRows = `50% 50%`;
viewportGrid.style.gridTemplateColumns = `33% 33% 33%`;
viewportGrid.style.width = '98vw';
viewportGrid.style.height = '60vh';

const content = document.getElementById('content');

content.appendChild(viewportGrid);

const element1_1 = document.createElement('div');
const element1_2 = document.createElement('div');
const element1_3 = document.createElement('div');
const element2_1 = document.createElement('div');
const element2_2 = document.createElement('div');
const element2_3 = document.createElement('div');

viewportGrid.appendChild(element1_1);
viewportGrid.appendChild(element1_2);
viewportGrid.appendChild(element1_3);
viewportGrid.appendChild(element2_1);
viewportGrid.appendChild(element2_2);
viewportGrid.appendChild(element2_3);

const elements = [
  element1_1,
  element1_2,
  element1_3,
  element2_1,
  element2_2,
  element2_3,
];

elements.forEach((element) => {
  element.style.width = '100%';
  element.style.height = '100%';

  // Disable right click context menu so we can have right click tools
  element.oncontextmenu = (e) => e.preventDefault();

  resizeObserver.observe(element);
});

// prettier-ignore
createInfoSection(content)
  .addInstruction('Click on any viewport and drag up/down to select a region of the image')
  .addInstruction('Wait for a few seconds to get the whole-body segmented')

// ============================= //

async function setUpToolGroups() {
  // Add tools to Cornerstone3D
  cornerstoneTools.addTool(PanTool);
  cornerstoneTools.addTool(ZoomTool);
  cornerstoneTools.addTool(StackScrollMouseWheelTool);
  cornerstoneTools.addTool(WholeBodySegmentTool);
  cornerstoneTools.addTool(SegmentationDisplayTool);

  // Define tool groups for the main 9 viewports.
  // Crosshairs currently only supports 3 viewports for a toolgroup due to the
  // way it is constructed, but its configuration input allows us to synchronize
  // multiple sets of 3 viewports.
  const ctToolGroup = ToolGroupManager.createToolGroup(ctToolGroupId);
  const ptToolGroup = ToolGroupManager.createToolGroup(ptToolGroupId);

  ctToolGroup.addViewport(viewportIds.CT.AXIAL, renderingEngineId);
  ctToolGroup.addViewport(viewportIds.CT.SAGITTAL, renderingEngineId);
  ctToolGroup.addViewport(viewportIds.CT.CORONAL, renderingEngineId);
  ptToolGroup.addViewport(viewportIds.PT.AXIAL, renderingEngineId);
  ptToolGroup.addViewport(viewportIds.PT.SAGITTAL, renderingEngineId);
  ptToolGroup.addViewport(viewportIds.PT.CORONAL, renderingEngineId);

  // Manipulation Tools
  for (const toolGroup of [ctToolGroup, ptToolGroup]) {
    toolGroup.addTool(PanTool.toolName);
    toolGroup.addTool(ZoomTool.toolName);
    toolGroup.addTool(StackScrollMouseWheelTool.toolName);
    toolGroup.addTool(WholeBodySegmentTool.toolName);
    toolGroup.addTool(SegmentationDisplayTool.toolName);

    toolGroup.setToolActive(WholeBodySegmentTool.toolName, {
      bindings: [
        {
          mouseButton: MouseBindings.Primary, // Left Click
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

    toolGroup.setToolActive(StackScrollMouseWheelTool.toolName);
    toolGroup.setToolEnabled(SegmentationDisplayTool.toolName);

    // Add the segmentation representation to the toolgroup
    await segmentation.addSegmentationRepresentations(toolGroup.id, [
      {
        segmentationId,
        type: csToolsEnums.SegmentationRepresentations.Labelmap,
      },
    ]);
  }
}

function setUpSynchronizers() {
  axialCameraPositionSynchronizer = createCameraPositionSynchronizer(
    axialCameraSynchronizerId
  );
  sagittalCameraPositionSynchronizer = createCameraPositionSynchronizer(
    sagittalCameraSynchronizerId
  );
  coronalCameraPositionSynchronizer = createCameraPositionSynchronizer(
    coronalCameraSynchronizerId
  );
  ctVoiSynchronizer = createVOISynchronizer(ctVoiSynchronizerId, undefined);
  ptVoiSynchronizer = createVOISynchronizer(ptVoiSynchronizerId, undefined);
  // Add viewports to camera synchronizers
  [viewportIds.CT.AXIAL, viewportIds.PT.AXIAL].forEach((viewportId) => {
    axialCameraPositionSynchronizer.add({
      renderingEngineId,
      viewportId,
    });
  });
  [viewportIds.CT.SAGITTAL, viewportIds.PT.SAGITTAL].forEach((viewportId) => {
    sagittalCameraPositionSynchronizer.add({
      renderingEngineId,
      viewportId,
    });
  });
  [viewportIds.CT.CORONAL, viewportIds.PT.CORONAL].forEach((viewportId) => {
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
    viewportIds.PT.AXIAL,
    viewportIds.PT.SAGITTAL,
    viewportIds.PT.CORONAL,
  ].forEach((viewportId) => {
    ptVoiSynchronizer.add({
      renderingEngineId,
      viewportId,
    });
  });
}

function getPtImageIds() {
  return createImageIdsAndCacheMetaData({
    StudyInstanceUID,
    SeriesInstanceUID:
      '1.3.6.1.4.1.14519.5.2.1.7009.2403.879445243400782656317561081015',
    wadoRsRoot,
  });
}
function getCtImageIds() {
  return createImageIdsAndCacheMetaData({
    StudyInstanceUID,
    SeriesInstanceUID:
      '1.3.6.1.4.1.14519.5.2.1.7009.2403.226151125820845824875394858561',
    wadoRsRoot,
  });
}

async function addSegmentationsToState() {
  // Create a segmentation of the same resolution as the source data
  await volumeLoader.createAndCacheDerivedSegmentationVolume(ctVolumeId, {
    volumeId: segmentationId,
  });

  // Add the segmentations to state
  segmentation.addSegmentations([
    {
      segmentationId,
      representation: {
        type: csToolsEnums.SegmentationRepresentations.Labelmap,
        data: {
          volumeId: segmentationId,
          referencedVolumeId: ctVolumeId,
        },
      },
    },
  ]);
}

async function setUpDisplay() {
  // Create the viewports

  const viewportInputArray = [
    {
      viewportId: viewportIds.CT.AXIAL,
      type: ViewportType.ORTHOGRAPHIC,
      element: element1_1,
      defaultOptions: {
        orientation: Enums.OrientationAxis.AXIAL,
      },
    },
    {
      viewportId: viewportIds.CT.SAGITTAL,
      type: ViewportType.ORTHOGRAPHIC,
      element: element1_2,
      defaultOptions: {
        orientation: Enums.OrientationAxis.SAGITTAL,
      },
    },
    {
      viewportId: viewportIds.CT.CORONAL,
      type: ViewportType.ORTHOGRAPHIC,
      element: element1_3,
      defaultOptions: {
        orientation: Enums.OrientationAxis.CORONAL,
      },
    },
    {
      viewportId: viewportIds.PT.AXIAL,
      type: ViewportType.ORTHOGRAPHIC,
      element: element2_1,
      defaultOptions: {
        orientation: Enums.OrientationAxis.AXIAL,
        background: <Types.Point3>[1, 1, 1],
      },
    },
    {
      viewportId: viewportIds.PT.SAGITTAL,
      type: ViewportType.ORTHOGRAPHIC,
      element: element2_2,
      defaultOptions: {
        orientation: Enums.OrientationAxis.SAGITTAL,
        background: <Types.Point3>[1, 1, 1],
      },
    },
    {
      viewportId: viewportIds.PT.CORONAL,
      type: ViewportType.ORTHOGRAPHIC,
      element: element2_3,
      defaultOptions: {
        orientation: Enums.OrientationAxis.CORONAL,
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
    [
      {
        volumeId: ctVolumeId,
        callback: setCtTransferFunctionForVolumeActor,
      },
    ],
    [viewportIds.CT.AXIAL, viewportIds.CT.SAGITTAL, viewportIds.CT.CORONAL]
  );

  await setVolumesForViewports(
    renderingEngine,
    [
      {
        volumeId: ptVolumeId,
        callback: setPetTransferFunctionForVolumeActor,
      },
    ],
    [viewportIds.PT.AXIAL, viewportIds.PT.SAGITTAL, viewportIds.PT.CORONAL]
  );

  initializeCameraSync(renderingEngine);

  // Render the viewports
  renderingEngine.render();
}

function updateLabelmapSegmentationConfig() {
  const globalSegmentationConfig = segmentation.config.getGlobalConfig();

  Object.assign(
    globalSegmentationConfig.representations.LABELMAP,
    DEFAULT_SEGMENT_CONFIG
  );

  segmentation.config.setGlobalConfig(globalSegmentationConfig);
}

function initializeCameraSync(renderingEngine) {
  // The fusion scene is the target as it is scaled to both volumes.
  // TODO -> We should have a more generic way to do this,
  // So that when all data is added we can synchronize zoom/position before interaction.

  const axialCtViewport = renderingEngine.getViewport(viewportIds.CT.AXIAL);
  const sagittalCtViewport = renderingEngine.getViewport(
    viewportIds.CT.SAGITTAL
  );
  const coronalCtViewport = renderingEngine.getViewport(viewportIds.CT.CORONAL);

  const axialPtViewport = renderingEngine.getViewport(viewportIds.PT.AXIAL);
  const sagittalPtViewport = renderingEngine.getViewport(
    viewportIds.PT.SAGITTAL
  );
  const coronalPtViewport = renderingEngine.getViewport(viewportIds.PT.CORONAL);

  initCameraSynchronization(axialPtViewport, axialCtViewport);
  initCameraSynchronization(sagittalPtViewport, sagittalCtViewport);
  initCameraSynchronization(coronalPtViewport, coronalCtViewport);

  renderingEngine.render();
}

function initCameraSynchronization(sViewport, tViewport) {
  // Initialise the sync as they viewports will have
  // Different initial zoom levels for viewports of different sizes.

  const camera = sViewport.getCamera();

  tViewport.setCamera(camera);
}

/**
 * Runs the demo
 */
async function run() {
  // Init Cornerstone and related libraries
  await initDemo();

  // Instantiate a rendering engine
  renderingEngine = new RenderingEngine(renderingEngineId);
  // Get Cornerstone imageIds and fetch metadata into RAM
  ctImageIds = await getCtImageIds();

  ptImageIds = await getPtImageIds();

  // Define a volume in memory
  ctVolume = await volumeLoader.createAndCacheVolume(ctVolumeId, {
    imageIds: ctImageIds,
  });
  // Define a volume in memory
  ptVolume = await volumeLoader.createAndCacheVolume(ptVolumeId, {
    imageIds: ptImageIds,
  });

  addSegmentationsToState();

  // Display needs to be set up first so that we have viewport to reference for tools and synchronizers.
  await setUpDisplay();

  // Update the labelmap segmentation config
  updateLabelmapSegmentationConfig();

  // Tools and synchronizers can be set up in any order.
  await setUpToolGroups();
  setUpSynchronizers();
}

run();
