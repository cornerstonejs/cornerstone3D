import {
  RenderingEngine,
  Types,
  Enums,
  getRenderingEngine,
  CONSTANTS,
} from '@cornerstonejs/core';
import {
  initDemo,
  setTitleAndDescription,
  addButtonToToolbar,
  addDropdownToToolbar,
  camera as cameraHelpers,
} from '../../../../utils/demo/helpers';

import vtkActor from '@kitware/vtk.js/Rendering/Core/Actor';
import vtkSphereSource from '@kitware/vtk.js/Filters/Sources/SphereSource';
import vtkMapper from '@kitware/vtk.js/Rendering/Core/Mapper';
import * as cornerstoneTools from '@cornerstonejs/tools';

// This is for debugging purposes
console.warn(
  'Click on index.ts to open source code for this example --------->'
);

const {
  PanTool,
  RotateTool,
  ZoomTool,
  ToolGroupManager,
  Enums: csToolsEnums,
} = cornerstoneTools;

const { ViewportType } = Enums;
const { MouseBindings } = csToolsEnums;
const { ORIENTATION } = CONSTANTS;

const renderingEngineId = 'myRenderingEngine';
const viewportId1 = 'POLYDATA_SAGITTAL_ORTHO';
const viewportId2 = 'POLYDATA_SAGITTAL_STERO';
const viewportIds = [viewportId1, viewportId2];

// ======== Set up page ======== //
setTitleAndDescription(
  'Non Volume Actor in Volume Viewport API',
  'Demonstrates how to interact with a Volume viewport with non volume actors.'
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

// Disable right click context menu so we can have right click tools
element1.oncontextmenu = (e) => e.preventDefault();
element2.oncontextmenu = (e) => e.preventDefault();

viewportGrid.appendChild(element1);
viewportGrid.appendChild(element2);

content.appendChild(viewportGrid);

const instructions = document.createElement('p');
instructions.innerText = `
  Basic controls:
  - Left Click / Drag : Rotate
  - Middle Click / Drag : Pan
  - Right Click / Drag : Zoom
  `;

content.append(instructions);

addButtonToToolbar({
  title: 'Reset Viewports',
  onClick: () => {
    // Get the rendering engine
    const renderingEngine = getRenderingEngine(renderingEngineId);

    viewportIds.forEach((viewportId) => {
      // Get the volume viewport
      const viewport = <Types.IVolumeViewport>(
        renderingEngine.getViewport(viewportId)
      );

      // Resets the viewport's camera
      viewport.resetCamera();

      viewport.render();
    });
  },
});

const orientationOptions = {
  axial: 'axial',
  sagittal: 'sagittal',
  coronal: 'coronal',
  oblique: 'oblique',
};

addDropdownToToolbar({
  options: {
    values: ['axial', 'sagittal', 'coronal', 'oblique'],
    defaultValue: 'sagittal',
  },
  onSelectedValueChange: (selectedValue) => {
    // Get the rendering engine
    const renderingEngine = getRenderingEngine(renderingEngineId);

    viewportIds.forEach((viewportId) => {
      // Get the volume viewport
      const viewport = <Types.IVolumeViewport>(
        renderingEngine.getViewport(viewportId)
      );

      let viewUp;
      let viewPlaneNormal;

      switch (selectedValue) {
        case orientationOptions.axial:
          viewUp = ORIENTATION.AXIAL.viewUp;
          viewPlaneNormal = ORIENTATION.AXIAL.sliceNormal;

          break;
        case orientationOptions.sagittal:
          viewUp = ORIENTATION.SAGITTAL.viewUp;
          viewPlaneNormal = ORIENTATION.SAGITTAL.sliceNormal;

          break;
        case orientationOptions.coronal:
          viewUp = ORIENTATION.CORONAL.viewUp;
          viewPlaneNormal = ORIENTATION.CORONAL.sliceNormal;

          break;
        case orientationOptions.oblique:
          // Some random oblique value for this dataset
          viewUp = [
            -0.5962687530844388, 0.5453181550345819, -0.5891448751239446,
          ];
          viewPlaneNormal = [
            -0.5962687530844388, 0.5453181550345819, -0.5891448751239446,
          ];

          break;
        default:
          throw new Error('undefined orientation option');
      }

      // Set the new orientation
      viewport.setCamera({ viewUp, viewPlaneNormal });
      // Reset the camera after the normal changes
      viewport.resetCamera();
      viewport.render();
    });
  },
});

/**
 * Runs the demo
 */
async function run() {
  // Init Cornerstone and related libraries
  await initDemo();

  const toolGroupId = 'NAVIGATION_TOOL_GROUP_ID';

  // Add tools to Cornerstone3D
  cornerstoneTools.addTool(PanTool);
  cornerstoneTools.addTool(RotateTool);
  cornerstoneTools.addTool(ZoomTool);

  // Define a tool group, which defines how mouse events map to tool commands for
  // Any viewport using the group
  const toolGroup = ToolGroupManager.createToolGroup(toolGroupId);
  // Add tools to the tool group
  toolGroup.addTool(PanTool.toolName);
  toolGroup.addTool(RotateTool.toolName);
  toolGroup.addTool(ZoomTool.toolName);

  // Set the initial state of the tools, here all tools are active and bound to
  // Different mouse inputs
  toolGroup.setToolActive(PanTool.toolName, {
    bindings: [
      {
        mouseButton: MouseBindings.Auxiliary, // Middle + Drag
      },
    ],
  });

  toolGroup.setToolActive(RotateTool.toolName, {
    bindings: [
      {
        mouseButton: MouseBindings.Primary, // Left Click + Drag
      },
    ],
  });

  toolGroup.setToolActive(ZoomTool.toolName, {
    bindings: [
      {
        mouseButton: MouseBindings.Secondary, // Right Click + Drag
      },
    ],
  });

  // Instantiate a rendering engine
  const renderingEngine = new RenderingEngine(renderingEngineId);

  // Create the viewports
  const viewportInputArray = [
    {
      viewportId: viewportId1,
      type: ViewportType.ORTHOGRAPHIC,
      element: element1,
      defaultOptions: {
        orientation: ORIENTATION.SAGITTAL,
        background: <Types.Point3>[0.2, 0, 0.2],
      },
    },
    {
      viewportId: viewportId2,
      type: ViewportType.PERSPECTIVE,
      element: element2,
      defaultOptions: {
        orientation: ORIENTATION.SAGITTAL,
        background: <Types.Point3>[0.2, 0, 0.2],
      },
    },
  ];

  renderingEngine.setViewports(viewportInputArray);

  // Set the tool group on the viewport
  toolGroup.addViewport(viewportId1, renderingEngineId);
  toolGroup.addViewport(viewportId2, renderingEngineId);

  viewportIds.forEach((viewportId) => {
    // Get the stack viewport that was created
    const viewport = <Types.IVolumeViewport>(
      renderingEngine.getViewport(viewportId)
    );

    const sphereSource = vtkSphereSource.newInstance({
      center: [0, 0, 0],
      radius: 100,
      phiResolution: 10,
      thetaResolution: 10,
    });
    const actor = vtkActor.newInstance();
    const mapper = vtkMapper.newInstance();

    actor.getProperty().setEdgeVisibility(true);

    mapper.setInputConnection(sphereSource.getOutputPort());
    actor.setMapper(mapper);

    const nonVolumeActors = [];
    nonVolumeActors.push({ uid: 'spherePolyData', actor });

    viewport.setActors(nonVolumeActors);

    // Render the image
    viewport.render();
  });
}

run();
