import type {
  BaseVolumeViewport,
  Types,
  VolumeViewport3D,
} from '@cornerstonejs/core';
import {
  RenderingEngine,
  Enums,
  setVolumesForViewports,
  volumeLoader,
  getRenderingEngine,
  eventTarget,
} from '@cornerstonejs/core';
import { Enums as toolsEnums } from '@cornerstonejs/tools';
import {
  initDemo,
  createImageIdsAndCacheMetaData,
  setTitleAndDescription,
  setCtTransferFunctionForVolumeActor,
  addDropdownToToolbar,
  addManipulationBindings,
  getLocalUrl,
  addToggleButtonToToolbar,
  addButtonToToolbar,
} from '../../../../utils/demo/helpers';

import vtkCellPicker from '@kitware/vtk.js/Rendering/Core/CellPicker';
import * as cornerstoneTools from '@cornerstonejs/tools';
import vtkActor from '@kitware/vtk.js/Rendering/Core/Actor';
import vtkSphereSource from '@kitware/vtk.js/Filters/Sources/SphereSource';
import vtkMapper from '@kitware/vtk.js/Rendering/Core/Mapper';

// This is for debugging purposes
console.warn(
  'Click on index.ts to open source code for this example --------->'
);

const {
  ToolGroupManager,
  Enums: csToolsEnums,
  CrosshairsTool,
  synchronizers,
  TrackballRotateTool,
  ZoomTool,
} = cornerstoneTools;

const { createSlabThicknessSynchronizer } = synchronizers;

const { MouseBindings } = csToolsEnums;
const { ViewportType } = Enums;

let sphereActor = undefined;

// Define a unique id for the volume
const volumeName = 'CT_VOLUME_ID'; // Id of the volume less loader prefix
const volumeLoaderScheme = 'cornerstoneStreamingImageVolume'; // Loader id which defines which volume loader to use
const volumeId = `${volumeLoaderScheme}:${volumeName}`; // VolumeId with loader id + volume id
const toolGroupId = 'MY_TOOLGROUP_ID';
const viewportId1 = 'CT_AXIAL';
const viewportId2 = 'CT_SAGITTAL';
const viewportId3 = 'CT_CORONAL';
const viewportId4 = 'CT_3D_VOLUME'; // New 3D volume viewport
const viewportIds = [viewportId1, viewportId2, viewportId3, viewportId4];
const renderingEngineId = 'myRenderingEngine';
const synchronizerId = 'SLAB_THICKNESS_SYNCHRONIZER_ID';
///////////////////////////////////////
const newToolGroupId = 'NEW_TOOL_GROUP_ID';

/////////////////////////////////////////
// ======== Set up page ======== //
setTitleAndDescription(
  'Crosshairs with 3D Volume',
  'Here we demonstrate crosshairs linking three orthogonal views of the same data with a 3D volume rendering. You can select the blend mode that will be used if you modify the slab thickness of the crosshairs by dragging the control points.'
);

const size = '400px';
const content = document.getElementById('content');
const viewportGrid = document.createElement('div');

viewportGrid.style.display = 'flex';
viewportGrid.style.flexDirection = 'row';
viewportGrid.style.width = '100%';
viewportGrid.style.height = '800px';

// Create elements for the viewports
const element1 = document.createElement('div'); // Axial
const element2 = document.createElement('div'); // Sagittal
const element3 = document.createElement('div'); // Coronal
const element4 = document.createElement('div'); // 3D Volume

// Create a container for the right side viewports
const rightViewportsContainer = document.createElement('div');
rightViewportsContainer.style.display = 'flex';
rightViewportsContainer.style.flexDirection = 'column';
rightViewportsContainer.style.width = '50%';
rightViewportsContainer.style.height = '100%';

// Set styles for the 2D viewports (stacked vertically on the right)
element1.style.width = '100%';
element1.style.height = '33.33%';
element1.style.minHeight = '200px';

element2.style.width = '100%';
element2.style.height = '33.33%';
element2.style.minHeight = '200px';

element3.style.width = '100%';
element3.style.height = '33.33%';
element3.style.minHeight = '200px';

// Set styles for the 3D viewport (on the left)
element4.style.width = '50%';
element4.style.height = '100%';
element4.style.minHeight = '600px';
element4.style.position = 'relative';

// Disable right click context menu so we can have right click tools
element1.oncontextmenu = (e) => e.preventDefault();
element2.oncontextmenu = (e) => e.preventDefault();
element3.oncontextmenu = (e) => e.preventDefault();
element4.oncontextmenu = (e) => e.preventDefault();

// Add elements to the viewport grid
// First add the 3D viewport on the left
viewportGrid.appendChild(element4);

// Add the 2D viewports stacked vertically on the right
rightViewportsContainer.appendChild(element1);
rightViewportsContainer.appendChild(element2);
rightViewportsContainer.appendChild(element3);
viewportGrid.appendChild(rightViewportsContainer);

content.appendChild(viewportGrid);

const instructions = document.createElement('p');
instructions.innerText = `
  Basic controls:
  - Click/Drag anywhere in the viewport to move the center of the crosshairs.
  - Drag a reference line to move it, scrolling the other views.

  Advanced controls: Hover over a line and find the following two handles:
  - Square (closest to center): Drag these to change the thickness of the MIP slab in that plane.
  - Circle (further from center): Drag these to rotate the axes.
  `;

content.append(instructions);

addButtonToToolbar({
  title: 'Reset Camera',
  onClick: () => {
    const renderingEngine = getRenderingEngine(renderingEngineId);

    viewportIds.forEach((viewportId) => {
      const viewport = renderingEngine.getViewport(viewportId);
      viewport.resetCamera();
      viewport.render();
    });
  },
});

// ============================= //
function addTemporaryPickedPositionLabel(
  x: number,
  y: number,
  pickedPoint: Types.Point3
) {
  // Create a temporary div to show the coordinates
  const coordDiv = document.createElement('div');
  coordDiv.style.position = 'absolute';
  coordDiv.style.top = `${y + 10}px`;
  coordDiv.style.left = `${x + 10}px`;
  coordDiv.style.backgroundColor = 'rgba(0, 0, 0, 0.7)';
  coordDiv.style.color = 'white';
  coordDiv.style.padding = '5px';
  coordDiv.style.borderRadius = '3px';
  coordDiv.style.zIndex = '1000';
  coordDiv.style.pointerEvents = 'none';
  coordDiv.textContent = `X: ${pickedPoint[0].toFixed(
    2
  )}, Y: ${pickedPoint[1].toFixed(2)}, Z: ${pickedPoint[2].toFixed(2)}`;

  element4.appendChild(coordDiv);

  // Remove the div after a few seconds
  setTimeout(() => {
    if (element4.contains(coordDiv)) {
      element4.removeChild(coordDiv);
    }
  }, 3000);
}

function setCrossHairPosition(pickedPoint) {
  const toolGroup = ToolGroupManager.getToolGroup(toolGroupId);
  const crosshairTool = toolGroup.getToolInstance(CrosshairsTool.toolName);
  crosshairTool.setToolCenter(pickedPoint, true);
}

function addSphere(viewport, point) {
  if (!sphereActor) {
    // Generate a random string for the sphere UID
    const randomUID = 'sphere_' + Math.random().toString(36).substring(2, 15);

    const sphereSource = vtkSphereSource.newInstance();
    sphereSource.setCenter(point);
    sphereSource.setRadius(5);
    const sphereMapper = vtkMapper.newInstance();
    sphereMapper.setInputConnection(sphereSource.getOutputPort());
    sphereActor = vtkActor.newInstance();
    sphereActor.setMapper(sphereMapper);
    sphereActor.getProperty().setColor(0.0, 0.0, 1.0);
    viewport.addActor({ actor: sphereActor, uid: randomUID });
  } else {
    sphereActor.getMapper().getInputConnection().filter.setCenter(point);
  }
  viewport.render();
}

const viewportColors = {
  [viewportId1]: 'rgb(200, 0, 0)',
  [viewportId2]: 'rgb(200, 200, 0)',
  [viewportId3]: 'rgb(0, 200, 0)',
  [viewportId4]: 'rgb(0, 200, 200)',
};

let synchronizer;

const viewportReferenceLineControllable = [
  viewportId1,
  viewportId2,
  viewportId3,
  viewportId4,
];

const viewportReferenceLineDraggableRotatable = [
  viewportId1,
  viewportId2,
  viewportId3,
  viewportId4,
];

const viewportReferenceLineSlabThicknessControlsOn = [
  viewportId1,
  viewportId2,
  viewportId3,
  viewportId4,
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

const blendModeOptions = {
  MIP: 'Maximum Intensity Projection',
  MINIP: 'Minimum Intensity Projection',
  AIP: 'Average Intensity Projection',
};

addDropdownToToolbar({
  options: {
    values: [
      'Maximum Intensity Projection',
      'Minimum Intensity Projection',
      'Average Intensity Projection',
    ],
    defaultValue: 'Maximum Intensity Projection',
  },
  onSelectedValueChange: (selectedValue) => {
    let blendModeToUse;
    switch (selectedValue) {
      case blendModeOptions.MIP:
        blendModeToUse = Enums.BlendModes.MAXIMUM_INTENSITY_BLEND;
        break;
      case blendModeOptions.MINIP:
        blendModeToUse = Enums.BlendModes.MINIMUM_INTENSITY_BLEND;
        break;
      case blendModeOptions.AIP:
        blendModeToUse = Enums.BlendModes.AVERAGE_INTENSITY_BLEND;
        break;
      default:
        throw new Error('undefined orientation option');
    }

    const toolGroup = ToolGroupManager.getToolGroup(toolGroupId);

    const crosshairsInstance = toolGroup.getToolInstance(
      CrosshairsTool.toolName
    );
    const oldConfiguration = crosshairsInstance.configuration;

    crosshairsInstance.configuration = {
      ...oldConfiguration,
      slabThicknessBlendMode: blendModeToUse,
    };

    // Update the blendMode for actors to instantly reflect the change
    toolGroup.viewportsInfo.forEach(({ viewportId, renderingEngineId }) => {
      const renderingEngine = getRenderingEngine(renderingEngineId);
      const viewport = renderingEngine.getViewport(
        viewportId
      ) as Types.IVolumeViewport;

      viewport.setBlendMode(blendModeToUse);
      viewport.render();
    });

    // Also update the 3D volume viewport
    const renderingEngine = getRenderingEngine(renderingEngineId);
    const viewport3D = renderingEngine.getViewport(
      viewportId4
    ) as Types.IVolumeViewport;
    viewport3D.setBlendMode(blendModeToUse);
    viewport3D.render();
  },
});

addToggleButtonToToolbar({
  id: 'syncSlabThickness',
  title: 'Sync Slab Thickness',
  defaultToggle: false,
  onClick: (toggle) => {
    synchronizer.setEnabled(toggle);
  },
});

function setUpSynchronizers() {
  synchronizer = createSlabThicknessSynchronizer(synchronizerId);

  // Add viewports to VOI synchronizers
  [viewportId1, viewportId2, viewportId3, viewportId4].forEach((viewportId) => {
    synchronizer.add({
      renderingEngineId,
      viewportId,
    });
  });
  // Normally this would be left on, but here we are starting the demo in the
  // default state, which is to not have a synchronizer enabled.
  synchronizer.setEnabled(false);
}

/**
 * Runs the demo
 */
async function run() {
  // Init Cornerstone and related libraries
  await initDemo();

  // Add tools to Cornerstone3D
  cornerstoneTools.addTool(CrosshairsTool);
  cornerstoneTools.addTool(TrackballRotateTool);
  const newToolGroup = ToolGroupManager.createToolGroup(newToolGroupId);
  newToolGroup.addTool(TrackballRotateTool.toolName);
  newToolGroup.setToolActive(TrackballRotateTool.toolName, {
    bindings: [
      {
        mouseButton: MouseBindings.Primary, // Left Click
      },
    ],
  });
  newToolGroup.setToolActive(ZoomTool.toolName, {
    bindings: [
      {
        mouseButton: MouseBindings.Secondary, // Left Click
      },
    ],
  });

  // Get Cornerstone imageIds for the source data and fetch metadata into RAM
  const imageIds = await createImageIdsAndCacheMetaData({
    StudyInstanceUID:
      '1.3.6.1.4.1.14519.5.2.1.7009.2403.334240657131972136850343327463',
    SeriesInstanceUID:
      '1.3.6.1.4.1.14519.5.2.1.7009.2403.226151125820845824875394858561',
    wadoRsRoot:
      getLocalUrl() || 'https://d14fa38qiwhyfd.cloudfront.net/dicomweb',
  });

  // Define a volume in memory
  const volume = await volumeLoader.createAndCacheVolume(volumeId, {
    imageIds,
  });
  volume.load();

  // Instantiate a rendering engine
  const renderingEngine = new RenderingEngine(renderingEngineId);

  // Create the viewports
  const viewportInputArray = [
    {
      viewportId: viewportId1,
      type: ViewportType.ORTHOGRAPHIC,
      element: element1,
      defaultOptions: {
        orientation: Enums.OrientationAxis.AXIAL,
        background: <Types.Point3>[0, 0, 0],
      },
    },
    {
      viewportId: viewportId2,
      type: ViewportType.ORTHOGRAPHIC,
      element: element2,
      defaultOptions: {
        orientation: Enums.OrientationAxis.SAGITTAL,
        background: <Types.Point3>[0, 0, 0],
      },
    },
    {
      viewportId: viewportId3,
      type: ViewportType.ORTHOGRAPHIC,
      element: element3,
      defaultOptions: {
        orientation: Enums.OrientationAxis.CORONAL,
        background: <Types.Point3>[0, 0, 0],
      },
    },
    {
      viewportId: viewportId4,
      type: ViewportType.VOLUME_3D,
      element: element4,
      defaultOptions: {
        background: <Types.Point3>[0, 0, 0],
        orientation: Enums.OrientationAxis.CORONAL,
      },
    },
  ];

  renderingEngine.setViewports(viewportInputArray);

  // Set the volume to load
  volume.load();

  // Set volumes on the viewports
  await setVolumesForViewports(
    renderingEngine,
    [
      {
        volumeId,
        callback: setCtTransferFunctionForVolumeActor,
      },
    ],
    viewportIds
  );

  // Define tool groups to add the segmentation display tool to
  const toolGroup = ToolGroupManager.createToolGroup(toolGroupId);
  addManipulationBindings(toolGroup);

  // For the crosshairs to operate, the viewports must currently be
  // added ahead of setting the tool active. This will be improved in the future.
  toolGroup.addViewport(viewportId1, renderingEngineId);
  toolGroup.addViewport(viewportId2, renderingEngineId);
  toolGroup.addViewport(viewportId3, renderingEngineId);
  newToolGroup.addViewport(viewportId4, renderingEngineId);

  // Manipulation Tools
  // Add Crosshairs tool and configure it to link the three viewports
  // These viewports could use different tool groups. See the PET-CT example
  // for a more complicated used case.

  const isMobile = window.matchMedia('(any-pointer:coarse)').matches;

  toolGroup.addTool(CrosshairsTool.toolName, {
    getReferenceLineColor,
    getReferenceLineControllable,
    getReferenceLineDraggableRotatable,
    getReferenceLineSlabThicknessControlsOn,
    mobile: {
      enabled: isMobile,
      opacity: 0.8,
      handleRadius: 9,
    },
  });

  toolGroup.setToolActive(CrosshairsTool.toolName, {
    bindings: [{ mouseButton: MouseBindings.Primary }],
  });

  setUpSynchronizers();

  const picker = vtkCellPicker.newInstance({ opacityThreshold: 0.0001 });
  picker.setPickFromList(1);
  picker.setTolerance(0);
  picker.initializePickList();
  // Render the image
  const viewport = renderingEngine.getViewport(viewportId4) as VolumeViewport3D;
  renderingEngine.renderViewports(viewportIds);
  await setVolumesForViewports(
    renderingEngine,
    [{ volumeId }],
    [viewportId4]
  ).then(() => {
    viewport.setProperties({
      preset: 'CT-Bone',
    });
    const defaultActor = viewport.getDefaultActor();
    if (defaultActor?.actor) {
      // Cast to any to avoid type errors with different actor types
      picker.addPickList(defaultActor.actor as any);
      prepareImageDataForPicking(viewport);
    }
    viewport.render();
  });

  // Add right-click event handler to element4 for picking coordinates
  element4.addEventListener('mousedown', (evt) => {
    // Check if it's a right-click (button 2)
    if (evt.button === 2) {
      evt.preventDefault();
      evt.stopPropagation();

      // Get the rendering engine and viewport
      const renderingEngine = getRenderingEngine(renderingEngineId);
      const viewport = renderingEngine.getViewport(
        viewportId4
      ) as VolumeViewport3D;

      // Get canvas coordinates relative to the element
      const rect = element4.getBoundingClientRect();
      const x = evt.clientX - rect.left;
      const y = evt.clientY - rect.top;

      const displayCoords = viewport.getVtkDisplayCoords([x, y]);
      // Use the picker to get the 3D coordinates
      picker.pick(
        [displayCoords[0], displayCoords[1], 0],
        viewport.getRenderer()
      );

      // Get the picked position
      const pickedPositions = picker.getPickedPositions();
      const actors = picker.getActors();
      if (actors.length > 0) {
        const pickedPoint = pickedPositions[0];
        if (pickedPoint) {
          console.log('Picked point coordinates:', pickedPoint);
          addSphere(viewport, pickedPoint);
          addTemporaryPickedPositionLabel(x, y, pickedPoint);
          setCrossHairPosition(pickedPoint);
        }
      }
    }
  });
}

eventTarget.addEventListener(
  toolsEnums.Events.CROSSHAIR_TOOL_CENTER_CHANGED,
  (evt) => {
    const { toolCenter } = evt.detail;
    const renderingEngine = getRenderingEngine(renderingEngineId);
    const viewport = renderingEngine.getViewport(
      viewportId4
    ) as VolumeViewport3D;
    if (sphereActor) {
      addSphere(viewport, toolCenter);
    }
  }
);

/**
 * Creates the minimum infrastructure needed to pick a point in the 3D volume
 * with VTK.js
 * @remarks
 * Is this the right place to put this function?
 * @param viewport
 * @returns
 */
function prepareImageDataForPicking(viewport: BaseVolumeViewport) {
  const volumeActor = viewport.getDefaultActor()?.actor;
  if (!volumeActor) {
    return;
  }
  // Get the imageData from the volumeActor
  const imageData = volumeActor.getMapper().getInputData();

  if (!imageData) {
    console.error('No imageData found in the volumeActor');
    return null;
  }

  // Get the voxelManager from the imageData
  const { voxelManager } = imageData.get('voxelManager');

  if (!voxelManager) {
    console.error('No voxelManager found in the imageData');
    return imageData;
  }

  // Create a fake scalar object to expose the scalar data to VTK.js
  const fakeScalars = {
    getData: () => {
      return voxelManager.getCompleteScalarDataArray();
    },
    getNumberOfComponents: () => voxelManager.numberOfComponents,
    getDataType: () =>
      voxelManager.getCompleteScalarDataArray().constructor.name,
  };

  // Set the point data to return the fakeScalars
  imageData.setPointData({
    getScalars: () => fakeScalars,
  });
}

run();
