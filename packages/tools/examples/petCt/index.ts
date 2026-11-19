import type { PlanarViewport, Types } from '@cornerstonejs/core';
import {
  RenderingEngine,
  Enums,
  volumeLoader,
  getRenderingEngine,
  utilities,
  viewportProjection,
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
  EllipticalROITool,
  CircleROITool,
  PlanarFreehandROITool,
  PlanarRotateTool,
  measurementTargetFilters,
} = cornerstoneTools;

const { MouseBindings } = csToolsEnums;
const { ViewportType, BlendModes } = Enums;

const { createCameraPositionSynchronizer, createVOISynchronizer } =
  synchronizers;

let renderingEngine: RenderingEngine;
const wadoRsRoot = 'https://d14fa38qiwhyfd.cloudfront.net/dicomweb';
const StudyInstanceUID =
  '1.3.6.1.4.1.14519.5.2.1.7009.2403.334240657131972136850343327463';
const renderingEngineId = 'myRenderingEngine';
const volumeLoaderScheme = 'cornerstoneStreamingImageVolume'; // Loader id which defines which volume loader to use
const ctVolumeName = 'CT_VOLUME_ID'; // Id of the volume less loader prefix
const ctVolumeId = `${volumeLoaderScheme}:${ctVolumeName}`; // VolumeId with loader id + volume id
const ptVolumeName = 'PT_VOLUME_ID';
const ptVolumeId = `${volumeLoaderScheme}:${ptVolumeName}`;
const ctDisplaySetId = 'PET_CT_CT_DISPLAY_SET_ID';
const ptDisplaySetId = 'PET_CT_PT_DISPLAY_SET_ID';

/**
 * The blend mode of the MIP slab that the square handles of the crosshairs
 * set on the CT and the PT. The crosshairs set the slab thickness and not the
 * blend mode, so the example sets it on the display sets of the slices.
 */
const slabBlendMode = Enums.BlendModes.MAXIMUM_INTENSITY_BLEND;
const ctToolGroupId = 'CT_TOOLGROUP_ID';
const ptToolGroupId = 'PT_TOOLGROUP_ID';
const fusionToolGroupId = 'FUSION_TOOLGROUP_ID';
const mipToolGroupUID = 'MIP_TOOLGROUP_ID';
let ctImageIds;
let ptImageIds;
let ctVolume;
let ptVolume;
const axialCameraSynchronizerId = 'AXIAL_CAMERA_SYNCHRONIZER_ID';
const sagittalCameraSynchronizerId = 'SAGITTAL_CAMERA_SYNCHRONIZER_ID';
const coronalCameraSynchronizerId = 'CORONAL_CAMERA_SYNCHRONIZER_ID';
const ctVoiSynchronizerId = 'CT_VOI_SYNCHRONIZER_ID';
const ptVoiSynchronizerId = 'PT_VOI_SYNCHRONIZER_ID';
const fusionVoiSynchronizerId = 'FUSION_VOI_SYNCHRONIZER_ID';
let axialCameraPositionSynchronizer;
let sagittalCameraPositionSynchronizer;
let coronalCameraPositionSynchronizer;
let ctVoiSynchronizer;
let ptVoiSynchronizer;
let fusionVoiSynchronizer;
let mipToolGroup;
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
  'PT-CT fusion layout with Crosshairs, and synchronized cameras, CT W/L and PET threshold'
);

// Every area annotation tool selects its voxels through the same shared
// sampler, so all four belong here: this example is the way to compare them
// on an oblique plane, and across two modalities of different slice
// thickness.
const roiToolNames = [
  RectangleROITool.toolName,
  EllipticalROITool.toolName,
  CircleROITool.toolName,
  PlanarFreehandROITool.toolName,
];

// Crosshairs rotate the plane, which changes how oblique the OTHER two views
// are. PlanarRotateTool rolls the view about its own normal, which is the
// in-plane rotation, and the two are worth testing separately.
const primaryToolNames = [
  WindowLevelTool.toolName,
  PlanarRotateTool.toolName,
  ...roiToolNames,
];

const optionsValues = [
  WindowLevelTool.toolName,
  CrosshairsTool.toolName,
  PlanarRotateTool.toolName,
  ...roiToolNames,
];

// ============================= //
addDropdownToToolbar({
  options: { values: optionsValues, defaultValue: WindowLevelTool.toolName },
  onSelectedValueChange: (toolNameAsStringOrNumber) => {
    const toolName = String(toolNameAsStringOrNumber);

    [ctToolGroupId, ptToolGroupId, fusionToolGroupId].forEach((toolGroupId) => {
      const toolGroup = ToolGroupManager.getToolGroup(toolGroupId);

      // Everything that is not the selection gives up the primary button,
      // and it goes PASSIVE rather than disabled. A disabled annotation tool
      // also hides the annotations that the user already drew, so disabling
      // the ROI tools made the measurements vanish whenever the user picked
      // the crosshairs or the rotate tool.
      for (const name of primaryToolNames) {
        if (name !== toolName) {
          toolGroup.setToolPassive(name);
        }
      }

      if (roiToolNames.includes(toolName)) {
        // The one exception. An ROI tool draws with the primary button, and a
        // passive crosshair takes a click near a reference line before the ROI
        // tool sees it, so the reference lines step aside while drawing.
        toolGroup.setToolDisabled(CrosshairsTool.toolName);
      } else if (toolName !== CrosshairsTool.toolName) {
        // Set crosshairs passive so they are still interactable
        toolGroup.setToolPassive(CrosshairsTool.toolName);
      }

      toolGroup.setToolActive(toolName, {
        bindings: [{ mouseButton: MouseBindings.Primary }],
      });
    });
  },
});

const resizeObserver = new ResizeObserver(() => {
  console.log('Size changed');

  renderingEngine = getRenderingEngine(renderingEngineId);

  if (renderingEngine) {
    renderingEngine.resize(true, false);
  }
});

const viewportGrid = document.createElement('div');

viewportGrid.style.display = 'grid';
viewportGrid.style.gridTemplateRows = `[row1-start] 33% [row2-start] 33% [row3-start] 33% [end]`;
viewportGrid.style.gridTemplateColumns = `[col1-start] 20% [col2-start] 20% [col3-start] 20% [col4-start] 20% [col5-start] 20%[end]`;
viewportGrid.style.width = '95vw';
viewportGrid.style.height = '80vh';

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
  element.style.width = '100%';
  element.style.height = '100%';

  // Disable right click context menu so we can have right click tools
  element.oncontextmenu = (e) => e.preventDefault();

  resizeObserver.observe(element);
});

element_mip.style.width = '100%';
element_mip.style.height = '100%';
element_mip.oncontextmenu = (e) => e.preventDefault();
resizeObserver.observe(element_mip);

const instructions = document.createElement('p');

instructions.innerText = `
  Basic Controls:
  - Left click: Use selected tool
  - Middle click: Pan
  - Right click: Zoom
  - Mouse Wheel: Stack Scroll

  Window Level Tool:
  - Drag to set the window level for the CT and threshold for the PET.

  Rectangle ROI Tool:
  - Left click and drag to draw a rectangle ROI.

  Crosshairs:
  - When the tool is active: Click/Drag anywhere in the viewport to move the center of the crosshairs.
  - Drag a reference line to move it, scrolling the other views.
  - Square (closest to center): Drag these to change the thickness of the MIP slab in that plane.
  - Circle (further from center): Drag these to rotate the axes.

  PET MIP:
  - Mouse Wheel: Rotate PET
  - Left click: Jump all views to the point of highest SUV in the region clicked.

  Volume_3D Controls:
  - Middle click : Rotate the image
  - Mouse Wheel: Rotate PET
  - Right click : Pan
  - Left click: Jump all views to the point of highest SUV in the region clicked.
  `;

instructions.style.gridColumnStart = '5';
instructions.style.gridRowStart = '1';
instructions.style.gridRowEnd = 'span 3';

viewportGrid.append(instructions);

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
  cornerstoneTools.addTool(StackScrollTool);
  cornerstoneTools.addTool(MIPJumpToClickTool);
  cornerstoneTools.addTool(CrosshairsTool);
  cornerstoneTools.addTool(TrackballRotateTool);
  cornerstoneTools.addTool(VolumeRotateTool);
  cornerstoneTools.addTool(RectangleROITool);
  cornerstoneTools.addTool(EllipticalROITool);
  cornerstoneTools.addTool(CircleROITool);
  cornerstoneTools.addTool(PlanarFreehandROITool);
  cornerstoneTools.addTool(PlanarRotateTool);

  // Define tool groups for the main 9 viewports.
  // Crosshairs currently only supports 3 viewports for a toolgroup due to the
  // way it is constructed, but its configuration input allows us to synchronize
  // multiple sets of 3 viewports.
  const ctToolGroup = ToolGroupManager.createToolGroup(ctToolGroupId);
  const ptToolGroup = ToolGroupManager.createToolGroup(ptToolGroupId);
  const fusionToolGroup = ToolGroupManager.createToolGroup(fusionToolGroupId);

  ctToolGroup.addViewport(viewportIds.CT.AXIAL, renderingEngineId);
  ctToolGroup.addViewport(viewportIds.CT.SAGITTAL, renderingEngineId);
  ctToolGroup.addViewport(viewportIds.CT.CORONAL, renderingEngineId);
  ptToolGroup.addViewport(viewportIds.PT.AXIAL, renderingEngineId);
  ptToolGroup.addViewport(viewportIds.PT.SAGITTAL, renderingEngineId);
  ptToolGroup.addViewport(viewportIds.PT.CORONAL, renderingEngineId);
  fusionToolGroup.addViewport(viewportIds.FUSION.AXIAL, renderingEngineId);
  fusionToolGroup.addViewport(viewportIds.FUSION.SAGITTAL, renderingEngineId);
  fusionToolGroup.addViewport(viewportIds.FUSION.CORONAL, renderingEngineId);

  // Manipulation Tools
  [ctToolGroup, ptToolGroup].forEach((toolGroup) => {
    toolGroup.addTool(PanTool.toolName);
    toolGroup.addTool(ZoomTool.toolName);
    toolGroup.addTool(StackScrollTool.toolName);
    toolGroup.addTool(CrosshairsTool.toolName, {
      getReferenceLineColor,
      getReferenceLineControllable,
      getReferenceLineDraggableRotatable,
      getReferenceLineSlabThicknessControlsOn,
    });
    toolGroup.addTool(PlanarRotateTool.toolName);
    roiToolNames.forEach((toolName) => toolGroup.addTool(toolName));
  });

  fusionToolGroup.addTool(PanTool.toolName);
  fusionToolGroup.addTool(ZoomTool.toolName);
  fusionToolGroup.addTool(StackScrollTool.toolName);
  fusionToolGroup.addTool(PlanarRotateTool.toolName);
  fusionToolGroup.addTool(CrosshairsTool.toolName, {
    getReferenceLineColor,
    getReferenceLineControllable,
    getReferenceLineDraggableRotatable,
    getReferenceLineSlabThicknessControlsOn,
    // Only set CT volume to MIP in the fusion viewport
    filterActorUIDsToSetSlabThickness: [ctVolumeId],
  });
  // The same PT-only targeting applies to every area annotation tool.
  roiToolNames.forEach((toolName) =>
    fusionToolGroup.addTool(toolName, {
      // Compute/show statistics for the PT volume of the fusion viewport only,
      // selected by its volume id.  The `allPixelData` chooser takes every
      // eligible candidate, and the `forId` predicate narrows eligibility to
      // that volume; `measurementTargetFilters.forModality('PT')` would select
      // the same volume by modality instead, and leaving the default
      // configuration (allPixelData with no predicate) would compute/show the
      // statistics of both PT and CT at once.
      // (This replaces the deprecated `isPreferredTargetId` configuration.)
      targetsFilter: measurementTargetFilters.allPixelData,
      targetPredicate: measurementTargetFilters.forId(ptVolumeId),
    })
  );

  // Here is the difference in the toolGroups used, that we need to specify the
  // volume to use for the WindowLevelTool for the fusion viewports
  ctToolGroup.addTool(WindowLevelTool.toolName);
  ptToolGroup.addTool(WindowLevelTool.toolName);
  fusionToolGroup.addTool(WindowLevelTool.toolName);

  [ctToolGroup, ptToolGroup, fusionToolGroup].forEach((toolGroup) => {
    toolGroup.setToolActive(WindowLevelTool.toolName, {
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

    toolGroup.setToolActive(StackScrollTool.toolName, {
      bindings: [{ mouseButton: MouseBindings.Wheel }],
    });
    toolGroup.setToolPassive(CrosshairsTool.toolName);
  });

  // MIP Tool Groups
  mipToolGroup = ToolGroupManager.createToolGroup(mipToolGroupUID);
  mipToolGroup.addTool(VolumeRotateTool.toolName);
  mipToolGroup.setToolActive(VolumeRotateTool.toolName, {
    bindings: [{ mouseButton: MouseBindings.Wheel }],
  });
  mipToolGroup.addTool(MIPJumpToClickTool.toolName, {
    toolGroupId: ptToolGroupId,
  });

  // Set the initial state of the tools, here we set one tool active on left click.
  // This means left click will draw that tool.
  mipToolGroup.setToolActive(MIPJumpToClickTool.toolName, {
    bindings: [
      {
        mouseButton: MouseBindings.Primary, // Left Click
      },
    ],
  });

  mipToolGroup.addViewport(viewportIds.PETMIP.CORONAL, renderingEngineId);
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
  ctVoiSynchronizer = createVOISynchronizer(ctVoiSynchronizerId, {
    syncInvertState: false,
    syncColormap: false,
  });
  ptVoiSynchronizer = createVOISynchronizer(ptVoiSynchronizerId, {
    syncInvertState: false,
    syncColormap: false,
  });
  fusionVoiSynchronizer = createVOISynchronizer(fusionVoiSynchronizerId, {
    syncInvertState: false,
    syncColormap: false,
  });
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
    viewportIds.PT.AXIAL,
    viewportIds.PT.SAGITTAL,
    viewportIds.PT.CORONAL,
    viewportIds.PETMIP.CORONAL,
  ].forEach((viewportId) => {
    ptVoiSynchronizer.add({
      renderingEngineId,
      viewportId,
    });
  });
  [
    viewportIds.FUSION.AXIAL,
    viewportIds.FUSION.SAGITTAL,
    viewportIds.FUSION.CORONAL,
  ].forEach((viewportId) => {
    fusionVoiSynchronizer.add({
      renderingEngineId,
      viewportId,
    });
    ctVoiSynchronizer.addTarget({
      renderingEngineId,
      viewportId,
    });
    ptVoiSynchronizer.addTarget({
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

async function setUpDisplay() {
  // Create the viewports

  const viewportInputArray = [
    {
      viewportId: viewportIds.CT.AXIAL,
      type: ViewportType.PLANAR_NEXT,
      element: element1_1,
      defaultOptions: {
        orientation: Enums.OrientationAxis.AXIAL,
      },
    },
    {
      viewportId: viewportIds.CT.SAGITTAL,
      type: ViewportType.PLANAR_NEXT,
      element: element1_2,
      defaultOptions: {
        orientation: Enums.OrientationAxis.SAGITTAL,
      },
    },
    {
      viewportId: viewportIds.CT.CORONAL,
      type: ViewportType.PLANAR_NEXT,
      element: element1_3,
      defaultOptions: {
        orientation: Enums.OrientationAxis.CORONAL,
      },
    },
    {
      viewportId: viewportIds.PT.AXIAL,
      type: ViewportType.PLANAR_NEXT,
      element: element2_1,
      defaultOptions: {
        orientation: Enums.OrientationAxis.AXIAL,
        background: <Types.Point3>[1, 1, 1],
      },
    },
    {
      viewportId: viewportIds.PT.SAGITTAL,
      type: ViewportType.PLANAR_NEXT,
      element: element2_2,
      defaultOptions: {
        orientation: Enums.OrientationAxis.SAGITTAL,
        background: <Types.Point3>[1, 1, 1],
      },
    },
    {
      viewportId: viewportIds.PT.CORONAL,
      type: ViewportType.PLANAR_NEXT,
      element: element2_3,
      defaultOptions: {
        orientation: Enums.OrientationAxis.CORONAL,
        background: <Types.Point3>[1, 1, 1],
      },
    },
    {
      viewportId: viewportIds.FUSION.AXIAL,
      type: ViewportType.PLANAR_NEXT,
      element: element3_1,
      defaultOptions: {
        orientation: Enums.OrientationAxis.AXIAL,
      },
    },
    {
      viewportId: viewportIds.FUSION.SAGITTAL,
      type: ViewportType.PLANAR_NEXT,
      element: element3_2,
      defaultOptions: {
        orientation: Enums.OrientationAxis.SAGITTAL,
      },
    },
    {
      viewportId: viewportIds.FUSION.CORONAL,
      type: ViewportType.PLANAR_NEXT,
      element: element3_3,
      defaultOptions: {
        orientation: Enums.OrientationAxis.CORONAL,
      },
    },
    {
      viewportId: viewportIds.PETMIP.CORONAL,
      type: ViewportType.PLANAR_NEXT,
      element: element_mip,
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

  // Set the display sets on the viewports
  await showDisplaySets(
    [
      {
        displaySetId: ctDisplaySetId,
        presentation: { ...ctPresentation(), blendMode: slabBlendMode },
      },
    ],
    [viewportIds.CT.AXIAL, viewportIds.CT.SAGITTAL, viewportIds.CT.CORONAL]
  );

  await showDisplaySets(
    [
      {
        displaySetId: ptDisplaySetId,
        presentation: { ...petPresentation(), blendMode: slabBlendMode },
      },
    ],
    [viewportIds.PT.AXIAL, viewportIds.PT.SAGITTAL, viewportIds.PT.CORONAL]
  );

  await showDisplaySets(
    [
      {
        displaySetId: ctDisplaySetId,
        presentation: { ...ctPresentation(), blendMode: slabBlendMode },
      },
      {
        displaySetId: ptDisplaySetId,
        presentation: petColorMapPresentation(),
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

  await showDisplaySets(
    [
      {
        displaySetId: ptDisplaySetId,
        presentation: {
          ...petPresentation(),
          blendMode: BlendModes.MAXIMUM_INTENSITY_BLEND,
          slabThickness,
        },
      },
    ],
    [viewportIds.PETMIP.CORONAL]
  );

  initializeCameraSync(renderingEngine);

  // Render the viewports
  renderingEngine.render();
}

addButtonToToolbar({
  title: 'toggle volume3d',
  onClick: async () => {
    const viewportInput = {
      viewportId: viewportIds.PETMIP.CORONAL,
      type: ViewportType.VOLUME_3D_NEXT,
      element: element_mip,
      defaultOptions: {
        orientation: Enums.OrientationAxis.CORONAL,
        background: <Types.Point3>[1, 1, 1],
      },
    };
    const volume3dToolGroup = mipToolGroup;
    await toggleVolume(viewportInput);
    setupVolume3dSynchronizer(viewportInput);
    setUpVolume3dToolGroup(volume3dToolGroup);

    renderingEngine.render();
  },
});

/**
 * Shows the PET in the MIP place as a volume rendering of its maximum
 * intensity. A 3D viewport draws the whole volume, so it takes no slab.
 */
async function toggleVolume(viewportInput) {
  renderingEngine.enableElement(viewportInput);

  await showDisplaySets(
    [
      {
        displaySetId: ptDisplaySetId,
        presentation: {
          ...petPresentation(),
          blendMode: BlendModes.MAXIMUM_INTENSITY_BLEND,
        },
      },
    ],
    [viewportIds.PETMIP.CORONAL]
  );
}
function setupVolume3dSynchronizer(viewportInput) {
  ptVoiSynchronizer.addTarget({
    renderingEngineId,
    viewportId: viewportInput.viewportId,
  });
}
function setUpVolume3dToolGroup(toolGroup) {
  toolGroup.addTool(PanTool.toolName);
  toolGroup.addTool(TrackballRotateTool.toolName);

  toolGroup.setToolActive(PanTool.toolName, {
    bindings: [
      {
        mouseButton: MouseBindings.Secondary,
      },
    ],
  });
  toolGroup.setToolActive(TrackballRotateTool.toolName, {
    bindings: [
      {
        mouseButton: MouseBindings.Auxiliary,
      },
    ],
  });
  toolGroup.addViewport(viewportIds.PETMIP.CORONAL, renderingEngineId);
}
function initializeCameraSync(renderingEngine: RenderingEngine) {
  // The fusion scene is the target as it is scaled to both volumes.
  // TODO -> We should have a more generic way to do this,
  // So that when all data is added we can synchronize zoom/position before interaction.

  const axialCtViewport = renderingEngine.getViewport<PlanarViewport>(
    viewportIds.CT.AXIAL
  );
  const sagittalCtViewport = renderingEngine.getViewport<PlanarViewport>(
    viewportIds.CT.SAGITTAL
  );
  const coronalCtViewport = renderingEngine.getViewport<PlanarViewport>(
    viewportIds.CT.CORONAL
  );

  const axialPtViewport = renderingEngine.getViewport<PlanarViewport>(
    viewportIds.PT.AXIAL
  );
  const sagittalPtViewport = renderingEngine.getViewport<PlanarViewport>(
    viewportIds.PT.SAGITTAL
  );
  const coronalPtViewport = renderingEngine.getViewport<PlanarViewport>(
    viewportIds.PT.CORONAL
  );

  const axialFusionViewport = renderingEngine.getViewport<PlanarViewport>(
    viewportIds.FUSION.AXIAL
  );
  const sagittalFusionViewport = renderingEngine.getViewport<PlanarViewport>(
    viewportIds.FUSION.SAGITTAL
  );
  const coronalFusionViewport = renderingEngine.getViewport<PlanarViewport>(
    viewportIds.FUSION.CORONAL
  );

  initCameraSynchronization(axialFusionViewport, axialCtViewport);
  initCameraSynchronization(axialFusionViewport, axialPtViewport);

  initCameraSynchronization(sagittalFusionViewport, sagittalCtViewport);
  initCameraSynchronization(sagittalFusionViewport, sagittalPtViewport);

  initCameraSynchronization(coronalFusionViewport, coronalCtViewport);
  initCameraSynchronization(coronalFusionViewport, coronalPtViewport);

  renderingEngine.render();
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
      const viewport = renderingEngine.getViewport<Types.IViewport>(viewportId);

      await viewport.setDisplaySets(
        ...entries.map(({ displaySetId }) => ({ displaySetId }))
      );
      entries.forEach(({ displaySetId, presentation }) => {
        viewport.setDisplaySetPresentation(displaySetId, presentation);
      });
    })
  );
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

  utilities.genericViewportDisplaySetMetadataProvider.add(ctDisplaySetId, {
    kind: 'planar',
    imageIds: ctImageIds,
    volumeId: ctVolumeId,
  });
  utilities.genericViewportDisplaySetMetadataProvider.add(ptDisplaySetId, {
    kind: 'planar',
    imageIds: ptImageIds,
    volumeId: ptVolumeId,
  });

  // Display needs to be set up first so that we have viewport to reference for tools and synchronizers.
  await setUpDisplay();

  // Tools and synchronizers can be set up in any order.
  setUpToolGroups();
  setUpSynchronizers();
}

run();
