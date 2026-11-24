import type { PlanarViewport, Types } from '@cornerstonejs/core';
import {
  RenderingEngine,
  Enums,
  volumeLoader,
  getRenderingEngine,
  cache,
  viewportProjection,
  displaySetRegistry,
} from '@cornerstonejs/core';
import {
  initDemo,
  createImageIdsAndCacheMetaData,
  setTitleAndDescription,
  addDropdownToToolbar,
  addButtonToToolbar,
} from '../../../../utils/demo/helpers';
import {
  ctPresentation,
  petPresentation,
  petColorMapPresentation,
} from '../../../../utils/demo/helpers/volumePresentationRecipes';
import * as cornerstoneTools from '@cornerstonejs/tools';

const {
  ToolGroupManager,
  Enums: csToolsEnums,
  WindowLevelTool,
  PanTool,
  ZoomTool,
  StackScrollTool,
  synchronizers,
  MIPJumpToClickTool,
  CrosshairsTool,
  TrackballRotateTool,
  VolumeRotateTool,
  RectangleROITool,
  CircleROITool,
  LengthTool,
  BidirectionalTool,
  CircleROIStartEndThresholdTool,
  RectangleROIStartEndThresholdTool,
  segmentation,
} = cornerstoneTools;

const { MouseBindings, KeyboardBindings } = csToolsEnums;
const { ViewportType, BlendModes } = Enums;

const { createCameraPositionSynchronizer, createVOISynchronizer } =
  synchronizers;

// Study IDs
const FirstStudyID = `1.3.6.1.4.1.14519.5.2.1.7009.2403.871108593056125491804754960339`;
// const SecondStudyID =
//   '1.3.6.1.4.1.14519.5.2.1.7009.2403.334240657131972136850343327463';
// const ThirdStudyID = `1.3.6.1.4.1.9328.50.17.15423521354819720574322014551955370036`;

// Common configuration
let renderingEngine: RenderingEngine;
const wadoRsRoot = 'https://d14fa38qiwhyfd.cloudfront.net/dicomweb';
const renderingEngineId = 'myRenderingEngine';
const volumeLoaderScheme = 'cornerstoneStreamingImageVolume';

const segmentationId = 'MY_SEGMENTATION_ID';

// Volume IDs for each study
const volumeIds = {
  study1: {
    ct: `${volumeLoaderScheme}:CT_VOLUME_STUDY1`,
    pt: `${volumeLoaderScheme}:PT_VOLUME_STUDY1`,
  },
};

/** The display set ids of each study. */
const displaySetIds = {
  study1: {
    ct: 'tmtv:study1:ct',
    pt: 'tmtv:study1:pt',
  },
};

// Tool group IDs for each study
const toolGroupIds = {
  study1: {
    ct: 'CT_TOOLGROUP_STUDY1',
    pt: 'PT_TOOLGROUP_STUDY1',
    fusion: 'FUSION_TOOLGROUP_STUDY1',
    mip: 'MIP_TOOLGROUP_STUDY1',
  },
};

// Viewport IDs for each study
const viewportIds = {
  study1: {
    CT: {
      AXIAL: 'CT_AXIAL_S1',
      SAGITTAL: 'CT_SAGITTAL_S1',
      CORONAL: 'CT_CORONAL_S1',
    },
    PT: {
      AXIAL: 'PT_AXIAL_S1',
      SAGITTAL: 'PT_SAGITTAL_S1',
      CORONAL: 'PT_CORONAL_S1',
    },
    FUSION: {
      AXIAL: 'FUSION_AXIAL_S1',
      SAGITTAL: 'FUSION_SAGITTAL_S1',
      CORONAL: 'FUSION_CORONAL_S1',
    },
    PETMIP: { CORONAL: 'PET_MIP_CORONAL_S1' },
  },
};

// Synchronizer IDs for each study
const synchronizerIds = {
  study1: {
    axialCamera: 'AXIAL_CAMERA_SYNC_S1',
    sagittalCamera: 'SAGITTAL_CAMERA_SYNC_S1',
    coronalCamera: 'CORONAL_CAMERA_SYNC_S1',
    ctVoi: 'CT_VOI_SYNC_S1',
    ptVoi: 'PT_VOI_SYNC_S1',
    fusionVoi: 'FUSION_VOI_SYNC_S1',
  },
};

// Store volumes and synchronizers
const volumes = {
  study1: { ct: null, pt: null },
  study2: { ct: null, pt: null },
  study3: { ct: null, pt: null },
};

const allSynchronizers = {
  study1: {},
  study2: {},
  study3: {},
};

// Study configurations
const studyConfigs = [
  {
    studyId: FirstStudyID,
    studyKey: 'study1',
    ctSeriesUID:
      '1.3.6.1.4.1.14519.5.2.1.7009.2403.367700692008930469189923116409',
    ptSeriesUID:
      '1.3.6.1.4.1.14519.5.2.1.7009.2403.780462962868572737240023906400',
  },
];

// Store DOM elements
const elements = {};

// Viewport colors
const viewportColors = {};

// Initialize viewport colors for all studies
['study1'].forEach((studyKey) => {
  const studyViewportIds = viewportIds[studyKey];
  viewportColors[studyViewportIds.CT.AXIAL] = 'rgb(200, 0, 0)';
  viewportColors[studyViewportIds.CT.SAGITTAL] = 'rgb(200, 200, 0)';
  viewportColors[studyViewportIds.CT.CORONAL] = 'rgb(0, 200, 0)';
  viewportColors[studyViewportIds.PT.AXIAL] = 'rgb(200, 0, 0)';
  viewportColors[studyViewportIds.PT.SAGITTAL] = 'rgb(200, 200, 0)';
  viewportColors[studyViewportIds.PT.CORONAL] = 'rgb(0, 200, 0)';
  viewportColors[studyViewportIds.FUSION.AXIAL] = 'rgb(200, 0, 0)';
  viewportColors[studyViewportIds.FUSION.SAGITTAL] = 'rgb(200, 200, 0)';
  viewportColors[studyViewportIds.FUSION.CORONAL] = 'rgb(0, 200, 0)';
});

// ======== Set up page ======== //
setTitleAndDescription(
  'Multi-Monitor PET-CT',
  'Three studies displayed with PET-CT fusion layout, each with separate tool groups but shared rendering engine. Mouse: left button the tool of the dropdown, shift + left window level, middle pan, right zoom, wheel scroll.'
);

const optionsValues = [
  RectangleROITool.toolName,
  CircleROITool.toolName,
  LengthTool.toolName,
  BidirectionalTool.toolName,
  WindowLevelTool.toolName,
  CrosshairsTool.toolName,
  CircleROIStartEndThresholdTool.toolName,
  RectangleROIStartEndThresholdTool.toolName,
];

addButtonToToolbar({
  title: 'Run Segmentation',
  onClick: () => {
    const annotations = cornerstoneTools.annotation.state.getAllAnnotations();
    const labelmapVolume = cache.getVolume(segmentationId);
    console.debug(annotations);
    annotations.map((annotation, i) => {
      // @ts-ignore
      const pointsInVolume = annotation.data.cachedStats.pointsInVolume;
      for (let i = 0; i < pointsInVolume.length; i++) {
        for (let j = 0; j < pointsInVolume[i].length; j++) {
          if (pointsInVolume[i][j].value > 2) {
            labelmapVolume.voxelManager.setAtIndex(
              pointsInVolume[i][j].index,
              1
            );
          }
        }
      }
    });

    cornerstoneTools.segmentation.triggerSegmentationEvents.triggerSegmentationDataModified(
      labelmapVolume.volumeId
    );
    labelmapVolume.modified();
  },
});

// ============================= //
addDropdownToToolbar({
  options: { values: optionsValues, defaultValue: ZoomTool.toolName },
  onSelectedValueChange: (toolNameAsStringOrNumber) => {
    const toolName = String(toolNameAsStringOrNumber);

    ['study1'].forEach((studyKey) => {
      const studyToolGroupIds = toolGroupIds[studyKey];
      [
        studyToolGroupIds.ct,
        studyToolGroupIds.pt,
        studyToolGroupIds.fusion,
      ].forEach((toolGroupId) => {
        const toolGroup = ToolGroupManager.getToolGroup(toolGroupId);

        toolGroup.setToolDisabled(WindowLevelTool.toolName);
        toolGroup.setToolActive(WindowLevelTool.toolName, {
          bindings: [
            {
              mouseButton: MouseBindings.Primary,
              modifierKey: KeyboardBindings.Shift,
            },
          ],
        });
        toolGroup.setToolDisabled(CrosshairsTool.toolName);
        toolGroup.setToolPassive(CircleROITool.toolName);
        toolGroup.setToolPassive(RectangleROITool.toolName);
        toolGroup.setToolPassive(LengthTool.toolName);
        toolGroup.setToolPassive(BidirectionalTool.toolName);
        toolGroup.setToolActive(toolName, {
          bindings: [{ mouseButton: MouseBindings.Primary }],
        });
      });
    });
  },
});

const resizeObserver = new ResizeObserver(() => {
  renderingEngine = getRenderingEngine(renderingEngineId);

  if (renderingEngine) {
    renderingEngine.resize(true, false);
  }
});

// Helper functions for crosshairs
function getReferenceLineColor(viewportId) {
  return viewportColors[viewportId];
}

function getReferenceLineControllable(viewportId) {
  return true;
}

function getReferenceLineDraggableRotatable(viewportId) {
  return true;
}

function getReferenceLineSlabThicknessControlsOn(viewportId) {
  return true;
}

// Create viewport grid
function createViewportGrid() {
  const viewportGrid = document.createElement('div');

  viewportGrid.style.display = 'grid';
  viewportGrid.style.gridTemplateRows = `repeat(3, 33.33%)`;
  viewportGrid.style.gridTemplateColumns = `repeat(12, 8.33%)`;
  viewportGrid.style.width = '200vw';
  viewportGrid.style.height = '95vh';
  viewportGrid.style.gap = '2px';

  const content = document.getElementById('content');
  content.appendChild(viewportGrid);

  // Create elements for each study
  studyConfigs.forEach((config, studyIndex) => {
    const studyKey = config.studyKey;
    elements[studyKey] = {};

    // Create 3x3 grid elements for each study
    for (let row = 0; row < 3; row++) {
      for (let col = 0; col < 3; col++) {
        const element = document.createElement('div');
        element.style.width = '100%';
        element.style.height = '100%';
        element.style.border = '1px solid #333';
        element.oncontextmenu = (e) => e.preventDefault();

        // Position in the overall grid - studies side by side
        const gridRow = row + 1;
        const gridColumn = studyIndex * 4 + col + 1;
        element.style.gridRow = String(gridRow);
        element.style.gridColumn = String(gridColumn);

        viewportGrid.appendChild(element);
        resizeObserver.observe(element);

        // Store element reference
        const elementKey = `element_${row + 1}_${col + 1}`;
        elements[studyKey][elementKey] = element;
      }
    }

    // Create MIP element
    const mipElement = document.createElement('div');
    mipElement.style.width = '100%';
    mipElement.style.height = '100%';
    mipElement.style.border = '1px solid #333';
    mipElement.oncontextmenu = (e) => e.preventDefault();

    // Position MIP in the 4th column of each study, spanning 3 rows
    mipElement.style.gridRow = `1 / span 3`;
    mipElement.style.gridColumn = String(studyIndex * 4 + 4);

    viewportGrid.appendChild(mipElement);
    resizeObserver.observe(mipElement);
    elements[studyKey].element_mip = mipElement;
  });

  return viewportGrid;
}

// Set up tool groups for a study
function setUpToolGroupsForStudy(studyKey) {
  const studyToolGroupIds = toolGroupIds[studyKey];
  const studyViewportIds = viewportIds[studyKey];
  const studyVolumeIds = volumeIds[studyKey];

  // Create tool groups
  const ctToolGroup = ToolGroupManager.createToolGroup(studyToolGroupIds.ct);
  const ptToolGroup = ToolGroupManager.createToolGroup(studyToolGroupIds.pt);
  const fusionToolGroup = ToolGroupManager.createToolGroup(
    studyToolGroupIds.fusion
  );
  const mipToolGroup = ToolGroupManager.createToolGroup(studyToolGroupIds.mip);

  // Add viewports to tool groups
  ctToolGroup.addViewport(studyViewportIds.CT.AXIAL, renderingEngineId);
  ctToolGroup.addViewport(studyViewportIds.CT.SAGITTAL, renderingEngineId);
  ctToolGroup.addViewport(studyViewportIds.CT.CORONAL, renderingEngineId);

  ptToolGroup.addViewport(studyViewportIds.PT.AXIAL, renderingEngineId);
  ptToolGroup.addViewport(studyViewportIds.PT.SAGITTAL, renderingEngineId);
  ptToolGroup.addViewport(studyViewportIds.PT.CORONAL, renderingEngineId);

  fusionToolGroup.addViewport(studyViewportIds.FUSION.AXIAL, renderingEngineId);
  fusionToolGroup.addViewport(
    studyViewportIds.FUSION.SAGITTAL,
    renderingEngineId
  );
  fusionToolGroup.addViewport(
    studyViewportIds.FUSION.CORONAL,
    renderingEngineId
  );

  // Add tools to CT and PT groups
  [ctToolGroup, ptToolGroup].forEach((toolGroup) => {
    toolGroup.addTool(WindowLevelTool.toolName);
    toolGroup.addTool(PanTool.toolName);
    toolGroup.addTool(ZoomTool.toolName);
    toolGroup.addTool(StackScrollTool.toolName);
    toolGroup.addTool(CrosshairsTool.toolName, {
      getReferenceLineColor,
      getReferenceLineControllable,
      getReferenceLineDraggableRotatable,
      getReferenceLineSlabThicknessControlsOn,
    });
    toolGroup.addTool(RectangleROITool.toolName);
    toolGroup.addTool(CircleROITool.toolName);
    toolGroup.addTool(LengthTool.toolName);
    toolGroup.addTool(BidirectionalTool.toolName);
    // if (toolGroup === ptToolGroup) {
    toolGroup.addTool(CircleROIStartEndThresholdTool.toolName, {
      calculatePointsInsideVolume: true,
      showTextBox: false,
      storePointData: true,
      /* Set a custom wait time */
      throttleTimeout: 100,
      /* Simplified handles */
      simplified: false,
    });
    toolGroup.addTool(RectangleROIStartEndThresholdTool.toolName, {
      calculatePointsInsideVolume: true,
      showTextBox: false,
      storePointData: true,
      /* Set a custom wait time */
      throttleTimeout: 100,
      /* Simplified handles */
      simplified: false,
    });
    // }
  });

  // Add tools to fusion group
  fusionToolGroup.addTool(WindowLevelTool.toolName);
  fusionToolGroup.addTool(PanTool.toolName);
  fusionToolGroup.addTool(ZoomTool.toolName);
  fusionToolGroup.addTool(StackScrollTool.toolName);
  fusionToolGroup.addTool(CrosshairsTool.toolName, {
    getReferenceLineColor,
    getReferenceLineControllable,
    getReferenceLineDraggableRotatable,
    getReferenceLineSlabThicknessControlsOn,
    filterActorUIDsToSetSlabThickness: [studyVolumeIds.ct],
  });
  fusionToolGroup.addTool(RectangleROITool.toolName);
  fusionToolGroup.addTool(CircleROIStartEndThresholdTool.toolName, {
    calculatePointsInsideVolume: true,
    showTextBox: false,
    storePointData: true,
    /* Set a custom wait time */
    throttleTimeout: 100,
    /* Simplified handles */
    simplified: false,
  });
  fusionToolGroup.addTool(RectangleROIStartEndThresholdTool.toolName, {
    calculatePointsInsideVolume: true,
    showTextBox: false,
    storePointData: true,
    /* Set a custom wait time */
    throttleTimeout: 100,
    /* Simplified handles */
    simplified: false,
  });

  // Set active tools
  [ctToolGroup, ptToolGroup, fusionToolGroup].forEach((toolGroup) => {
    toolGroup.setToolActive(ZoomTool.toolName, {
      bindings: [{ mouseButton: MouseBindings.Secondary }],
    });
    toolGroup.setToolActive(PanTool.toolName, {
      bindings: [{ mouseButton: MouseBindings.Auxiliary }],
    });
    toolGroup.setToolActive(RectangleROITool.toolName, {
      bindings: [{ mouseButton: MouseBindings.Primary }],
    });
    toolGroup.setToolActive(WindowLevelTool.toolName, {
      bindings: [
        {
          mouseButton: MouseBindings.Primary,
          modifierKey: KeyboardBindings.Shift,
        },
      ],
    });
    toolGroup.setToolActive(StackScrollTool.toolName, {
      bindings: [{ mouseButton: MouseBindings.Wheel }],
    });
    // Don't set CrosshairsTool to passive here - do it after viewports are created
  });

  // MIP Tool Group
  mipToolGroup.addTool(VolumeRotateTool.toolName);
  mipToolGroup.setToolActive(VolumeRotateTool.toolName, {
    bindings: [{ mouseButton: MouseBindings.Wheel }],
  });
  mipToolGroup.addTool(MIPJumpToClickTool.toolName, {
    toolGroupId: studyToolGroupIds.pt,
  });
  mipToolGroup.setToolActive(MIPJumpToClickTool.toolName, {
    bindings: [{ mouseButton: MouseBindings.Primary }],
  });
  mipToolGroup.addViewport(studyViewportIds.PETMIP.CORONAL, renderingEngineId);
}

// Set up synchronizers for a study
function setUpSynchronizersForStudy(studyKey) {
  const studySynchronizerIds = synchronizerIds[studyKey];
  const studyViewportIds = viewportIds[studyKey];

  // Create synchronizers
  const axialCameraSync = createCameraPositionSynchronizer(
    studySynchronizerIds.axialCamera
  );
  const sagittalCameraSync = createCameraPositionSynchronizer(
    studySynchronizerIds.sagittalCamera
  );
  const coronalCameraSync = createCameraPositionSynchronizer(
    studySynchronizerIds.coronalCamera
  );
  const ctVoiSync = createVOISynchronizer(studySynchronizerIds.ctVoi, {
    syncInvertState: false,
    syncColormap: false,
  });
  const ptVoiSync = createVOISynchronizer(studySynchronizerIds.ptVoi, {
    syncInvertState: false,
    syncColormap: false,
  });
  const fusionVoiSync = createVOISynchronizer(studySynchronizerIds.fusionVoi, {
    syncInvertState: false,
    syncColormap: false,
  });

  // Store synchronizers
  allSynchronizers[studyKey] = {
    axialCamera: axialCameraSync,
    sagittalCamera: sagittalCameraSync,
    coronalCamera: coronalCameraSync,
    ctVoi: ctVoiSync,
    ptVoi: ptVoiSync,
    fusionVoi: fusionVoiSync,
  };

  // Add viewports to camera synchronizers
  [
    studyViewportIds.CT.AXIAL,
    studyViewportIds.PT.AXIAL,
    studyViewportIds.FUSION.AXIAL,
  ].forEach((viewportId) => {
    axialCameraSync.add({ renderingEngineId, viewportId });
  });

  [
    studyViewportIds.CT.SAGITTAL,
    studyViewportIds.PT.SAGITTAL,
    studyViewportIds.FUSION.SAGITTAL,
  ].forEach((viewportId) => {
    sagittalCameraSync.add({ renderingEngineId, viewportId });
  });

  [
    studyViewportIds.CT.CORONAL,
    studyViewportIds.PT.CORONAL,
    studyViewportIds.FUSION.CORONAL,
  ].forEach((viewportId) => {
    coronalCameraSync.add({ renderingEngineId, viewportId });
  });

  // Add viewports to VOI synchronizers
  [
    studyViewportIds.CT.AXIAL,
    studyViewportIds.CT.SAGITTAL,
    studyViewportIds.CT.CORONAL,
  ].forEach((viewportId) => {
    ctVoiSync.add({ renderingEngineId, viewportId });
  });

  [
    studyViewportIds.PT.AXIAL,
    studyViewportIds.PT.SAGITTAL,
    studyViewportIds.PT.CORONAL,
    studyViewportIds.PETMIP.CORONAL,
  ].forEach((viewportId) => {
    ptVoiSync.add({ renderingEngineId, viewportId });
  });

  [
    studyViewportIds.FUSION.AXIAL,
    studyViewportIds.FUSION.SAGITTAL,
    studyViewportIds.FUSION.CORONAL,
  ].forEach((viewportId) => {
    fusionVoiSync.add({ renderingEngineId, viewportId });
    ctVoiSync.addTarget({ renderingEngineId, viewportId });
    ptVoiSync.addTarget({ renderingEngineId, viewportId });
  });
}

/**
 * Shows in the target viewport what the source viewport shows: the same
 * slice, the same world point at the centre of the canvas, and the same size.
 * Zoom 1 is the fit of each viewport, and the PT volume has another fit than
 * the CT volume, so the zoom of the target is its own zoom times the ratio of
 * the two parallel scales. The pan then moves the focal point of the source
 * to the centre of the target canvas.
 */
function initCameraSynchronization(
  sViewport: PlanarViewport,
  tViewport: PlanarViewport
) {
  tViewport.setViewReference(sViewport.getViewReference());

  const sourceCamera = sViewport.getResolvedView()?.toICamera();
  const targetCamera = tViewport.getResolvedView()?.toICamera();

  if (!sourceCamera || !targetCamera) {
    return;
  }

  const { zoom = 1 } =
    viewportProjection.getPresentation(tViewport, {
      selector: { zoom: true },
    }) ?? {};
  const zoomed = viewportProjection.withPresentation(tViewport, {
    zoom: (zoom * targetCamera.parallelScale) / sourceCamera.parallelScale,
  });

  if (zoomed) {
    tViewport.setViewState(zoomed);
  }

  const { pan = [0, 0], zoom: targetZoom = 1 } =
    viewportProjection.getPresentation(tViewport, {
      selector: { zoom: true, pan: true },
    }) ?? {};
  const [x, y] = tViewport.worldToCanvas(sourceCamera.focalPoint);
  const { clientWidth, clientHeight } = tViewport.canvas;
  const panned = viewportProjection.withPresentation(tViewport, {
    pan: [
      pan[0] + (clientWidth / 2 - x) / targetZoom,
      pan[1] + (clientHeight / 2 - y) / targetZoom,
    ],
  });

  if (panned) {
    tViewport.setViewState(panned);
  }
}

// Initialize camera sync for a study
function initializeCameraSyncForStudy(studyKey) {
  const studyViewportIds = viewportIds[studyKey];

  const axialCtViewport = renderingEngine.getViewport<PlanarViewport>(
    studyViewportIds.CT.AXIAL
  );
  const sagittalCtViewport = renderingEngine.getViewport<PlanarViewport>(
    studyViewportIds.CT.SAGITTAL
  );
  const coronalCtViewport = renderingEngine.getViewport<PlanarViewport>(
    studyViewportIds.CT.CORONAL
  );

  const axialPtViewport = renderingEngine.getViewport<PlanarViewport>(
    studyViewportIds.PT.AXIAL
  );
  const sagittalPtViewport = renderingEngine.getViewport<PlanarViewport>(
    studyViewportIds.PT.SAGITTAL
  );
  const coronalPtViewport = renderingEngine.getViewport<PlanarViewport>(
    studyViewportIds.PT.CORONAL
  );

  const axialFusionViewport = renderingEngine.getViewport<PlanarViewport>(
    studyViewportIds.FUSION.AXIAL
  );
  const sagittalFusionViewport = renderingEngine.getViewport<PlanarViewport>(
    studyViewportIds.FUSION.SAGITTAL
  );
  const coronalFusionViewport = renderingEngine.getViewport<PlanarViewport>(
    studyViewportIds.FUSION.CORONAL
  );

  initCameraSynchronization(axialFusionViewport, axialCtViewport);
  initCameraSynchronization(axialFusionViewport, axialPtViewport);

  initCameraSynchronization(sagittalFusionViewport, sagittalCtViewport);
  initCameraSynchronization(sagittalFusionViewport, sagittalPtViewport);

  initCameraSynchronization(coronalFusionViewport, coronalCtViewport);
  initCameraSynchronization(coronalFusionViewport, coronalPtViewport);
}

// Load image IDs for a study
async function getImageIdsForStudy(config) {
  const ctImageIds = await createImageIdsAndCacheMetaData({
    StudyInstanceUID: config.studyId,
    SeriesInstanceUID: config.ctSeriesUID,
    wadoRsRoot,
  });

  const ptImageIds = await createImageIdsAndCacheMetaData({
    StudyInstanceUID: config.studyId,
    SeriesInstanceUID: config.ptSeriesUID,
    wadoRsRoot,
  });

  return { ctImageIds, ptImageIds };
}

// Create viewport input array for a study
function createViewportInputArrayForStudy(config, studyIndex) {
  const studyKey = config.studyKey;
  const studyElements = elements[studyKey];
  const studyViewportIds = viewportIds[studyKey];

  // Create viewport input array
  const viewportInputArray = [
    {
      viewportId: studyViewportIds.CT.AXIAL,
      type: ViewportType.PLANAR,
      element: studyElements.element_1_1,
      defaultOptions: {
        orientation: Enums.OrientationAxis.AXIAL,
      },
    },
    {
      viewportId: studyViewportIds.CT.SAGITTAL,
      type: ViewportType.PLANAR,
      element: studyElements.element_1_2,
      defaultOptions: {
        orientation: Enums.OrientationAxis.SAGITTAL,
      },
    },
    {
      viewportId: studyViewportIds.CT.CORONAL,
      type: ViewportType.PLANAR,
      element: studyElements.element_1_3,
      defaultOptions: {
        orientation: Enums.OrientationAxis.CORONAL,
      },
    },
    {
      viewportId: studyViewportIds.PT.AXIAL,
      type: ViewportType.PLANAR,
      element: studyElements.element_2_1,
      defaultOptions: {
        orientation: Enums.OrientationAxis.AXIAL,
        background: <Types.Point3>[1, 1, 1],
      },
    },
    {
      viewportId: studyViewportIds.PT.SAGITTAL,
      type: ViewportType.PLANAR,
      element: studyElements.element_2_2,
      defaultOptions: {
        orientation: Enums.OrientationAxis.SAGITTAL,
        background: <Types.Point3>[1, 1, 1],
      },
    },
    {
      viewportId: studyViewportIds.PT.CORONAL,
      type: ViewportType.PLANAR,
      element: studyElements.element_2_3,
      defaultOptions: {
        orientation: Enums.OrientationAxis.CORONAL,
        background: <Types.Point3>[1, 1, 1],
      },
    },
    {
      viewportId: studyViewportIds.FUSION.AXIAL,
      type: ViewportType.PLANAR,
      element: studyElements.element_3_1,
      defaultOptions: {
        orientation: Enums.OrientationAxis.AXIAL,
      },
    },
    {
      viewportId: studyViewportIds.FUSION.SAGITTAL,
      type: ViewportType.PLANAR,
      element: studyElements.element_3_2,
      defaultOptions: {
        orientation: Enums.OrientationAxis.SAGITTAL,
      },
    },
    {
      viewportId: studyViewportIds.FUSION.CORONAL,
      type: ViewportType.PLANAR,
      element: studyElements.element_3_3,
      defaultOptions: {
        orientation: Enums.OrientationAxis.CORONAL,
      },
    },
    {
      viewportId: studyViewportIds.PETMIP.CORONAL,
      type: ViewportType.PLANAR,
      element: studyElements.element_mip,
      defaultOptions: {
        orientation: Enums.OrientationAxis.CORONAL,
        background: <Types.Point3>[1, 1, 1],
      },
    },
  ];

  return viewportInputArray;
}

/**
 * Shows display sets in each of the viewports, the first as the source, and
 * sets the presentation of each.
 */
async function showDisplaySets(
  entries: Array<{ displaySetId: string; presentation: object }>,
  targetViewportIds: string[]
) {
  await Promise.all(
    targetViewportIds.map(async (viewportId) => {
      const viewport = renderingEngine.getViewport<PlanarViewport>(viewportId);

      await viewport.setDisplaySets(
        ...entries.map(({ displaySetId }) => ({ displaySetId }))
      );
      entries.forEach(({ displaySetId, presentation }) => {
        viewport.setDisplaySetPresentation(displaySetId, presentation);
      });
    })
  );
}

// Set up display for a study
async function setUpDisplayForStudy(config, studyIndex) {
  const studyKey = config.studyKey;
  const studyViewportIds = viewportIds[studyKey];
  const studyDisplaySetIds = displaySetIds[studyKey];

  // Set volumes on the viewports
  await showDisplaySets(
    [
      {
        displaySetId: studyDisplaySetIds.ct,
        presentation: ctPresentation(),
      },
    ],
    [
      studyViewportIds.CT.AXIAL,
      studyViewportIds.CT.SAGITTAL,
      studyViewportIds.CT.CORONAL,
    ]
  );

  await showDisplaySets(
    [
      {
        displaySetId: studyDisplaySetIds.pt,
        presentation: petPresentation(),
      },
    ],
    [
      studyViewportIds.PT.AXIAL,
      studyViewportIds.PT.SAGITTAL,
      studyViewportIds.PT.CORONAL,
    ]
  );

  await showDisplaySets(
    [
      {
        displaySetId: studyDisplaySetIds.ct,
        presentation: ctPresentation(),
      },
      {
        displaySetId: studyDisplaySetIds.pt,
        presentation: petColorMapPresentation(),
      },
    ],
    [
      studyViewportIds.FUSION.AXIAL,
      studyViewportIds.FUSION.SAGITTAL,
      studyViewportIds.FUSION.CORONAL,
    ]
  );

  // Set up MIP
  const ptVolume = volumes[studyKey].pt;
  const ptVolumeDimensions = ptVolume.dimensions;

  const slabThickness = Math.sqrt(
    ptVolumeDimensions[0] * ptVolumeDimensions[0] +
      ptVolumeDimensions[1] * ptVolumeDimensions[1] +
      ptVolumeDimensions[2] * ptVolumeDimensions[2]
  );

  await showDisplaySets(
    [
      {
        displaySetId: studyDisplaySetIds.pt,
        presentation: {
          ...petPresentation(),
          blendMode: BlendModes.MAXIMUM_INTENSITY_BLEND,
          slabThickness,
        },
      },
    ],
    [studyViewportIds.PETMIP.CORONAL]
  );

  initializeCameraSyncForStudy(studyKey);
}

// Set crosshairs to passive after viewports are set up
function setCrosshairsToPassive() {
  studyConfigs.forEach((config) => {
    const studyKey = config.studyKey;
    const studyToolGroupIds = toolGroupIds[studyKey];

    [
      studyToolGroupIds.ct,
      studyToolGroupIds.pt,
      studyToolGroupIds.fusion,
    ].forEach((toolGroupId) => {
      const toolGroup = ToolGroupManager.getToolGroup(toolGroupId);
      if (toolGroup) {
        toolGroup.setToolPassive(CrosshairsTool.toolName);
      }
    });
  });
}

async function addSegmentationsToState() {
  // Create a segmentation of the same resolution as the source data
  volumeLoader.createAndCacheDerivedLabelmapVolume(volumeIds.study1.pt, {
    volumeId: segmentationId,
  });

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
}

/**
 * Runs the demo
 */
async function run() {
  // Init Cornerstone and related libraries
  await initDemo();

  // Add tools to Cornerstone3D
  cornerstoneTools.addTool(WindowLevelTool);
  cornerstoneTools.addTool(PanTool);
  cornerstoneTools.addTool(ZoomTool);
  cornerstoneTools.addTool(StackScrollTool);
  cornerstoneTools.addTool(MIPJumpToClickTool);
  cornerstoneTools.addTool(CrosshairsTool);
  cornerstoneTools.addTool(TrackballRotateTool);
  cornerstoneTools.addTool(VolumeRotateTool);
  cornerstoneTools.addTool(RectangleROITool);
  cornerstoneTools.addTool(CircleROITool);
  cornerstoneTools.addTool(LengthTool);
  cornerstoneTools.addTool(BidirectionalTool);
  cornerstoneTools.addTool(CircleROIStartEndThresholdTool);
  cornerstoneTools.addTool(RectangleROIStartEndThresholdTool);

  // Instantiate a rendering engine
  renderingEngine = new RenderingEngine(renderingEngineId);

  // Create viewport grid
  createViewportGrid();

  // Load all volumes and set up displays
  for (const config of studyConfigs) {
    const studyKey = config.studyKey;

    // Get image IDs
    const { ctImageIds, ptImageIds } = await getImageIdsForStudy(config);

    // Create and cache volumes
    volumes[studyKey].ct = await volumeLoader.createAndCacheVolume(
      volumeIds[studyKey].ct,
      { imageIds: ctImageIds }
    );
    volumes[studyKey].pt = await volumeLoader.createAndCacheVolume(
      volumeIds[studyKey].pt,
      { imageIds: ptImageIds }
    );

    displaySetRegistry.add(displaySetIds[studyKey].ct, {
      imageIds: ctImageIds,
      volumeId: volumeIds[studyKey].ct,
    });
    displaySetRegistry.add(displaySetIds[studyKey].pt, {
      imageIds: ptImageIds,
      volumeId: volumeIds[studyKey].pt,
    });

    // Load volumes
    volumes[studyKey].ct.load();
    volumes[studyKey].pt.load();
  }

  // Add some segmentations based on the source data volume
  await addSegmentationsToState();

  // Set up tool groups and synchronizers for each study
  for (const config of studyConfigs) {
    const studyKey = config.studyKey;
    setUpToolGroupsForStudy(studyKey);
    setUpSynchronizersForStudy(studyKey);
  }

  // Collect all viewport configurations
  const allViewportInputs = [];
  for (let i = 0; i < studyConfigs.length; i++) {
    const viewportInputs = createViewportInputArrayForStudy(studyConfigs[i], i);
    allViewportInputs.push(...viewportInputs);
  }

  // Set all viewports at once
  renderingEngine.setViewports(allViewportInputs);

  // Set up displays for all studies
  for (let i = 0; i < studyConfigs.length; i++) {
    await setUpDisplayForStudy(studyConfigs[i], i);
  }

  // Set crosshairs to passive after all viewports are initialized
  setCrosshairsToPassive();

  Object.values(viewportIds.study1.PT).map(async (viewportId) => {
    // Add the segmentation representation to the toolgroup
    await segmentation.addSegmentationRepresentations(viewportId, [
      {
        segmentationId,
        type: csToolsEnums.SegmentationRepresentations.Labelmap,
      },
    ]);
  });

  Object.values(viewportIds.study1.CT).map(async (viewportId) => {
    // Add the segmentation representation to the toolgroup
    await segmentation.addSegmentationRepresentations(viewportId, [
      {
        segmentationId,
        type: csToolsEnums.SegmentationRepresentations.Labelmap,
      },
    ]);
  });

  Object.values(viewportIds.study1.FUSION).map(async (viewportId) => {
    // Add the segmentation representation to the toolgroup
    await segmentation.addSegmentationRepresentations(viewportId, [
      {
        segmentationId,
        type: csToolsEnums.SegmentationRepresentations.Labelmap,
      },
    ]);
  });

  // Render all viewports
  renderingEngine.render();
}

run();
