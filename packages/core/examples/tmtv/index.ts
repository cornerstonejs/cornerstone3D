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
  setPetColorMapTransferFunctionForVolumeActor,
  setPetTransferFunctionForVolumeActor,
  setCtTransferFunctionForVolumeActor,
  addDropdownToToolbar,
  addButtonToToolbar,
} from '../../../../utils/demo/helpers';
import * as cornerstoneTools from '@cornerstonejs/tools';

const {
  ToolGroupManager,
  SynchronizerManager,
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
let renderingEngine;
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
      OBLIQUE: 'FUSION_OBLIQUE_S1',
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
  viewportColors[studyViewportIds.FUSION.OBLIQUE] = 'rgb(0, 200, 200)';
});

// ======== Set up page ======== //
setTitleAndDescription(
  'TMTV Mode with Tools',
  'Two series fused for TMTV with tools available to show how they interact with each other'
);

// Named ROI tool instances demonstrating the `targetsFilter` configuration,
// which selects the display sets a tool computes/shows statistics for based
// on the modality of the display set.
const circleROISUVToolName = 'CircleROISUV';
const rectangleROIHUToolName = 'RectangleROIHU';

const instructions = document.createElement('p');
instructions.innerText = `Select a tool from the drop down and drag on a viewport to create an ROI:
- "Rectangle/Circle ROI (all pixel data - default)": the default configuration computes and shows the statistics of every display set containing pixel values, so on the fusion (bottom row) viewports both the CT (HU) and PT (SUV) values appear at once. SEG display sets are never included, even when they are the only thing shown.
- "Circle ROI (PT SUV only)": configured with targetsFilter { key: 'modality', options: { modality: 'PT' } }, it shows the SUV statistics by preference - on the fusion viewports only the PT values appear, and on the CT-only viewports nothing is shown.
- "Rectangle ROI (CT HU only)": configured with targetsFilter { key: 'modality', options: { modality: 'CT' } }, it shows the HU statistics by preference - on the fusion viewports only the CT values appear, and on the PT-only viewports nothing is shown.
Annotations are shared across the viewports; a fusion viewport computes the statistics of each selected volume itself, even when no other viewport has computed them.
Use the "Layout" drop down to test the tools on different viewport arrangements: the default CT/PT/Fusion grid with the PET MIP, just the three fusion views, or a mixed layout (CT sagittal, PT coronal and an oblique CT+PT fusion). Annotations survive the layout switches and statistics are recomputed as needed.`;
document.getElementById('content').appendChild(instructions);

const optionsValues = [
  RectangleROITool.toolName,
  rectangleROIHUToolName,
  CircleROITool.toolName,
  circleROISUVToolName,
  LengthTool.toolName,
  BidirectionalTool.toolName,
  WindowLevelTool.toolName,
  CrosshairsTool.toolName,
  CircleROIStartEndThresholdTool.toolName,
  RectangleROIStartEndThresholdTool.toolName,
];

const optionsLabels = [
  'Rectangle ROI (all pixel data - default)',
  'Rectangle ROI (CT HU only)',
  'Circle ROI (all pixel data - default)',
  'Circle ROI (PT SUV only)',
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
  options: {
    values: optionsValues,
    labels: optionsLabels,
    defaultValue: ZoomTool.toolName,
  },
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
        toolGroup.setToolDisabled(CrosshairsTool.toolName);
        toolGroup.setToolPassive(CircleROITool.toolName);
        toolGroup.setToolPassive(circleROISUVToolName);
        toolGroup.setToolPassive(RectangleROITool.toolName);
        toolGroup.setToolPassive(rectangleROIHUToolName);
        toolGroup.setToolPassive(LengthTool.toolName);
        toolGroup.setToolPassive(BidirectionalTool.toolName);
        toolGroup.setToolActive(toolName, {
          bindings: [{ mouseButton: MouseBindings.Primary }],
        });
      });
    });
  },
});

// Layouts to test the tools on fusion, CT and PT viewports separately
const layoutKeys = ['default', 'fusion', 'oblique'];
const layoutLabels = [
  'CT / PT / Fusion + PET MIP (default)',
  'Fusion only (axial, sagittal, coronal)',
  'CT sagittal / PT coronal / Fusion oblique',
];

addDropdownToToolbar({
  labelText: 'Layout',
  options: {
    values: layoutKeys,
    labels: layoutLabels,
    defaultValue: 'default',
  },
  onSelectedValueChange: (layoutKey) => {
    applyLayout(String(layoutKey)).catch(console.error);
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

// An oblique orientation halfway between sagittal and coronal, keeping the
// patient axis vertical.
const obliqueOrientation = {
  viewPlaneNormal: <Types.Point3>[Math.SQRT1_2, -Math.SQRT1_2, 0],
  viewUp: <Types.Point3>[0, 0, 1],
};

/**
 * The viewports making up each layout: which data each shows ('ct', 'pt',
 * 'fusion' or 'mip'), its orientation and its css grid placement.
 * - 'default' is the full CT/PT/Fusion grid with the PET MIP column
 * - 'fusion' shows just the three fusion views
 * - 'oblique' mixes a CT sagittal, a PT coronal and an oblique CT+PT fusion
 */
function getLayoutViewportSpecs(studyKey, layoutKey) {
  const v = viewportIds[studyKey];
  const white = <Types.Point3>[1, 1, 1];
  const { AXIAL, SAGITTAL, CORONAL } = Enums.OrientationAxis;

  switch (layoutKey) {
    case 'fusion':
      return [
        {
          viewportId: v.FUSION.AXIAL,
          data: 'fusion',
          orientation: AXIAL,
          gridRow: '1',
          gridColumn: '1',
        },
        {
          viewportId: v.FUSION.SAGITTAL,
          data: 'fusion',
          orientation: SAGITTAL,
          gridRow: '1',
          gridColumn: '2',
        },
        {
          viewportId: v.FUSION.CORONAL,
          data: 'fusion',
          orientation: CORONAL,
          gridRow: '1',
          gridColumn: '3',
        },
      ];
    case 'oblique':
      return [
        {
          viewportId: v.CT.SAGITTAL,
          data: 'ct',
          orientation: SAGITTAL,
          gridRow: '1',
          gridColumn: '1',
        },
        {
          viewportId: v.PT.CORONAL,
          data: 'pt',
          orientation: CORONAL,
          background: white,
          gridRow: '1',
          gridColumn: '2',
        },
        {
          viewportId: v.FUSION.OBLIQUE,
          data: 'fusion',
          orientation: obliqueOrientation,
          gridRow: '1',
          gridColumn: '3',
        },
      ];
    case 'default':
    default:
      return [
        {
          viewportId: v.CT.AXIAL,
          data: 'ct',
          orientation: AXIAL,
          gridRow: '1',
          gridColumn: '1',
        },
        {
          viewportId: v.CT.SAGITTAL,
          data: 'ct',
          orientation: SAGITTAL,
          gridRow: '1',
          gridColumn: '2',
        },
        {
          viewportId: v.CT.CORONAL,
          data: 'ct',
          orientation: CORONAL,
          gridRow: '1',
          gridColumn: '3',
        },
        {
          viewportId: v.PT.AXIAL,
          data: 'pt',
          orientation: AXIAL,
          background: white,
          gridRow: '2',
          gridColumn: '1',
        },
        {
          viewportId: v.PT.SAGITTAL,
          data: 'pt',
          orientation: SAGITTAL,
          background: white,
          gridRow: '2',
          gridColumn: '2',
        },
        {
          viewportId: v.PT.CORONAL,
          data: 'pt',
          orientation: CORONAL,
          background: white,
          gridRow: '2',
          gridColumn: '3',
        },
        {
          viewportId: v.FUSION.AXIAL,
          data: 'fusion',
          orientation: AXIAL,
          gridRow: '3',
          gridColumn: '1',
        },
        {
          viewportId: v.FUSION.SAGITTAL,
          data: 'fusion',
          orientation: SAGITTAL,
          gridRow: '3',
          gridColumn: '2',
        },
        {
          viewportId: v.FUSION.CORONAL,
          data: 'fusion',
          orientation: CORONAL,
          gridRow: '3',
          gridColumn: '3',
        },
        {
          viewportId: v.PETMIP.CORONAL,
          data: 'mip',
          orientation: CORONAL,
          background: white,
          gridRow: '1 / span 3',
          gridColumn: '4',
        },
      ];
  }
}

// The grid container, rebuilt on each layout change
let viewportGridElement;

// Create viewport grid for a layout, returning the element of each viewport
function buildViewportGrid(specs, layoutKey) {
  resizeObserver.disconnect();
  viewportGridElement?.remove();

  viewportGridElement = document.createElement('div');
  viewportGridElement.style.display = 'grid';
  if (layoutKey === 'default') {
    viewportGridElement.style.gridTemplateRows = `repeat(3, 33.33%)`;
    viewportGridElement.style.gridTemplateColumns = `repeat(12, 8.33%)`;
    viewportGridElement.style.width = '200vw';
  } else {
    viewportGridElement.style.gridTemplateRows = '100%';
    viewportGridElement.style.gridTemplateColumns = 'repeat(3, 33.33%)';
    viewportGridElement.style.width = '100%';
  }
  viewportGridElement.style.height = '95vh';
  viewportGridElement.style.gap = '2px';

  document.getElementById('content').appendChild(viewportGridElement);

  const elementsByViewportId = {};
  specs.forEach((spec) => {
    const element = document.createElement('div');
    element.style.width = '100%';
    element.style.height = '100%';
    element.style.border = '1px solid #333';
    element.style.gridRow = spec.gridRow;
    element.style.gridColumn = spec.gridColumn;
    element.oncontextmenu = (e) => e.preventDefault();

    viewportGridElement.appendChild(element);
    resizeObserver.observe(element);
    elementsByViewportId[spec.viewportId] = element;
  });

  return elementsByViewportId;
}

/**
 * Applies one of the layouts: rebuilds the grid, replaces the viewports,
 * re-binds them to their tool groups and synchronizers, sets the volumes and
 * segmentations, and renders.  Annotations live in the annotation state (per
 * frame of reference), so they survive the switch and their statistics are
 * computed on the new viewports as needed.
 */
async function applyLayout(layoutKey) {
  if (!renderingEngine || !volumes.study1.ct) {
    // Still loading - the initial layout is applied by run()
    return;
  }

  const studyKey = 'study1';
  const specs = getLayoutViewportSpecs(studyKey, layoutKey);
  const elementsByViewportId = buildViewportGrid(specs, layoutKey);

  // Replace all the viewports of the rendering engine with the new set
  renderingEngine.setViewports(
    specs.map((spec) => ({
      viewportId: spec.viewportId,
      type: ViewportType.ORTHOGRAPHIC,
      element: elementsByViewportId[spec.viewportId],
      defaultOptions: {
        orientation: spec.orientation,
        ...(spec.background ? { background: spec.background } : {}),
      },
    }))
  );

  // Tool group membership follows the data shown in each viewport
  const studyToolGroupIds = toolGroupIds[studyKey];
  const toolGroupIdForData = {
    ct: studyToolGroupIds.ct,
    pt: studyToolGroupIds.pt,
    fusion: studyToolGroupIds.fusion,
    mip: studyToolGroupIds.mip,
  };
  Object.values(toolGroupIdForData).forEach((toolGroupId) => {
    ToolGroupManager.getToolGroup(toolGroupId)?.removeViewports(
      renderingEngineId
    );
  });
  specs.forEach((spec) => {
    ToolGroupManager.getToolGroup(toolGroupIdForData[spec.data])?.addViewport(
      spec.viewportId,
      renderingEngineId
    );
  });

  await setUpDisplayForLayout(studyKey, specs);
  setUpSynchronizersForStudy(studyKey, specs);
  await addSegmentationRepresentationsForViewports(
    specs.filter((spec) => spec.data !== 'mip').map((spec) => spec.viewportId)
  );
  initializeCameraSyncForStudy(studyKey, specs);

  renderingEngine.render();
}

// Set up tool groups for a study.  The viewports are added to the groups by
// applyLayout, based on which viewports the current layout contains.
function setUpToolGroupsForStudy(studyKey) {
  const studyToolGroupIds = toolGroupIds[studyKey];
  const studyVolumeIds = volumeIds[studyKey];

  // Create tool groups
  const ctToolGroup = ToolGroupManager.createToolGroup(studyToolGroupIds.ct);
  const ptToolGroup = ToolGroupManager.createToolGroup(studyToolGroupIds.pt);
  const fusionToolGroup = ToolGroupManager.createToolGroup(
    studyToolGroupIds.fusion
  );
  const mipToolGroup = ToolGroupManager.createToolGroup(studyToolGroupIds.mip);

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
    // The default ROI configuration ({ key: 'allPixelData' }) shows the
    // statistics of every display set containing pixel values.
    toolGroup.addTool(RectangleROITool.toolName);
    toolGroup.addTool(CircleROITool.toolName);
    // Named instances demonstrating modality based filters: the SUV circle
    // shows PT statistics by preference (and nothing on CT-only viewports),
    // the HU rectangle shows CT statistics by preference (and nothing on
    // PT-only viewports).  The targetsFilter names an annotationTargetFilter
    // metadata provider key and its options.
    toolGroup.addToolInstance(circleROISUVToolName, CircleROITool.toolName, {
      targetsFilter: { key: 'modality', options: { modality: 'PT' } },
    });
    toolGroup.addToolInstance(
      rectangleROIHUToolName,
      RectangleROITool.toolName,
      {
        targetsFilter: { key: 'modality', options: { modality: 'CT' } },
      }
    );
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
  // On the fusion viewports the `targetsFilter` configuration decides which
  // of the fused volumes (display sets) the tools compute and display
  // statistics for.  The default ROI tools show both the CT and PT values
  // at once ({ key: 'allPixelData' }); the named instances restrict the
  // statistics by modality.
  fusionToolGroup.addTool(RectangleROITool.toolName);
  fusionToolGroup.addTool(CircleROITool.toolName);
  fusionToolGroup.addToolInstance(
    circleROISUVToolName,
    CircleROITool.toolName,
    {
      targetsFilter: { key: 'modality', options: { modality: 'PT' } },
    }
  );
  fusionToolGroup.addToolInstance(
    rectangleROIHUToolName,
    RectangleROITool.toolName,
    {
      targetsFilter: { key: 'modality', options: { modality: 'CT' } },
    }
  );
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
      bindings: [
        {
          mouseButton: MouseBindings.Auxiliary,
          modifierKey: KeyboardBindings.Shift,
        },
      ],
    });
    toolGroup.setToolActive(PanTool.toolName, {
      bindings: [{ mouseButton: MouseBindings.Auxiliary }],
    });
    toolGroup.setToolActive(RectangleROITool.toolName, {
      bindings: [{ mouseButton: MouseBindings.Primary }],
    });
    toolGroup.setToolActive(WindowLevelTool.toolName, {
      bindings: [{ mouseButton: MouseBindings.Secondary }],
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
}

// Set up synchronizers for a study, for the viewports of the current layout.
// Called on each layout change - existing synchronizers are destroyed and
// recreated with only the viewports present in the layout.
function setUpSynchronizersForStudy(studyKey, specs) {
  const studySynchronizerIds = synchronizerIds[studyKey];
  const studyViewportIds = viewportIds[studyKey];
  const present = new Set(specs.map((spec) => spec.viewportId));

  // Destroy the previous layout's synchronizers so they can be recreated
  (Object.values(studySynchronizerIds) as string[]).forEach(
    (synchronizerId) => {
      SynchronizerManager.destroySynchronizer(synchronizerId);
    }
  );

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

  // Add the present viewports to the camera synchronizers, per orientation
  const cameraSyncGroups = [
    {
      sync: axialCameraSync,
      syncViewportIds: [
        studyViewportIds.CT.AXIAL,
        studyViewportIds.PT.AXIAL,
        studyViewportIds.FUSION.AXIAL,
      ],
    },
    {
      sync: sagittalCameraSync,
      syncViewportIds: [
        studyViewportIds.CT.SAGITTAL,
        studyViewportIds.PT.SAGITTAL,
        studyViewportIds.FUSION.SAGITTAL,
      ],
    },
    {
      sync: coronalCameraSync,
      syncViewportIds: [
        studyViewportIds.CT.CORONAL,
        studyViewportIds.PT.CORONAL,
        studyViewportIds.FUSION.CORONAL,
      ],
    },
  ];
  cameraSyncGroups.forEach(({ sync, syncViewportIds }) => {
    syncViewportIds
      .filter((viewportId) => present.has(viewportId))
      .forEach((viewportId) => {
        sync.add({ renderingEngineId, viewportId });
      });
  });

  // Add the present viewports to the VOI synchronizers by the data they show
  specs.forEach((spec) => {
    const syncTarget = { renderingEngineId, viewportId: spec.viewportId };
    if (spec.data === 'ct') {
      ctVoiSync.add(syncTarget);
    } else if (spec.data === 'pt' || spec.data === 'mip') {
      ptVoiSync.add(syncTarget);
    } else if (spec.data === 'fusion') {
      fusionVoiSync.add(syncTarget);
      ctVoiSync.addTarget(syncTarget);
      ptVoiSync.addTarget(syncTarget);
    }
  });
}

// Initialize camera synchronization
function initCameraSynchronization(sViewport, tViewport) {
  const camera = sViewport.getCamera();
  tViewport.setCamera(camera);
}

// Initialize camera sync for a study: align each CT/PT viewport with the
// fusion viewport of the same orientation, when both are in the layout
function initializeCameraSyncForStudy(studyKey, specs) {
  const studyViewportIds = viewportIds[studyKey];
  const present = new Set(specs.map((spec) => spec.viewportId));

  ['AXIAL', 'SAGITTAL', 'CORONAL'].forEach((orientation) => {
    const fusionViewportId = studyViewportIds.FUSION[orientation];
    if (!present.has(fusionViewportId)) {
      return;
    }
    const fusionViewport = renderingEngine.getViewport(fusionViewportId);

    [
      studyViewportIds.CT[orientation],
      studyViewportIds.PT[orientation],
    ].forEach((viewportId) => {
      if (present.has(viewportId)) {
        initCameraSynchronization(
          fusionViewport,
          renderingEngine.getViewport(viewportId)
        );
      }
    });
  });
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

// Set the volumes on the viewports of the current layout, based on the data
// each viewport shows: the CT volume, the PT volume, both fused, or the PT
// as a maximum intensity projection.
async function setUpDisplayForLayout(studyKey, specs) {
  const studyVolumeIds = volumeIds[studyKey];
  const viewportIdsForData = (data) =>
    specs.filter((spec) => spec.data === data).map((spec) => spec.viewportId);

  const ctViewportIds = viewportIdsForData('ct');
  if (ctViewportIds.length) {
    await setVolumesForViewports(
      renderingEngine,
      [
        {
          volumeId: studyVolumeIds.ct,
          callback: setCtTransferFunctionForVolumeActor,
        },
      ],
      ctViewportIds
    );
  }

  const ptViewportIds = viewportIdsForData('pt');
  if (ptViewportIds.length) {
    await setVolumesForViewports(
      renderingEngine,
      [
        {
          volumeId: studyVolumeIds.pt,
          callback: setPetTransferFunctionForVolumeActor,
        },
      ],
      ptViewportIds
    );
  }

  const fusionViewportIds = viewportIdsForData('fusion');
  if (fusionViewportIds.length) {
    await setVolumesForViewports(
      renderingEngine,
      [
        {
          volumeId: studyVolumeIds.ct,
          callback: setCtTransferFunctionForVolumeActor,
        },
        {
          volumeId: studyVolumeIds.pt,
          callback: setPetColorMapTransferFunctionForVolumeActor,
        },
      ],
      fusionViewportIds
    );
  }

  const mipViewportIds = viewportIdsForData('mip');
  if (mipViewportIds.length) {
    const ptVolumeDimensions = volumes[studyKey].pt.dimensions;

    const slabThickness = Math.sqrt(
      ptVolumeDimensions[0] * ptVolumeDimensions[0] +
        ptVolumeDimensions[1] * ptVolumeDimensions[1] +
        ptVolumeDimensions[2] * ptVolumeDimensions[2]
    );

    await setVolumesForViewports(
      renderingEngine,
      [
        {
          volumeId: studyVolumeIds.pt,
          callback: setPetTransferFunctionForVolumeActor,
          blendMode: BlendModes.MAXIMUM_INTENSITY_BLEND,
          slabThickness,
        },
      ],
      mipViewportIds
    );
  }
}

// Show the labelmap segmentation on the given viewports (no-op for
// viewports which already have the representation)
async function addSegmentationRepresentationsForViewports(
  segViewportIds: string[]
) {
  await Promise.all(
    segViewportIds.map((viewportId) =>
      segmentation.addSegmentationRepresentations(viewportId, [
        {
          segmentationId,
          type: csToolsEnums.SegmentationRepresentations.Labelmap,
        },
      ])
    )
  );
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

  // Load all volumes
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

    // Load volumes
    volumes[studyKey].ct.load();
    volumes[studyKey].pt.load();
  }

  // Add some segmentations based on the source data volume
  await addSegmentationsToState();

  // Set up tool groups for each study; the viewports join the groups when a
  // layout is applied
  for (const config of studyConfigs) {
    setUpToolGroupsForStudy(config.studyKey);
  }

  // Build the grid and viewports of the default layout, set the volumes,
  // synchronizers and segmentations, and render
  await applyLayout('default');

  // Set crosshairs to passive after all viewports are initialized
  setCrosshairsToPassive();
}

run();
