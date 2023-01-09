import { RenderingEngine, Types, Enums } from '@cornerstonejs/core';
import { setTitleAndDescription } from '../../../../utils/demo/helpers';
import { init as csRenderInit } from '@cornerstonejs/core';
import { init as csToolsInit } from '@cornerstonejs/tools';
import * as cornerstoneTools from '@cornerstonejs/tools';

import vtkActor from '@kitware/vtk.js/Rendering/Core/Actor';
import vtkSphereSource from '@kitware/vtk.js/Filters/Sources/SphereSource';
import vtkMapper from '@kitware/vtk.js/Rendering/Core/Mapper';

// This is for debugging purposes
console.warn(
  'Click on index.ts to open source code for this example --------->'
);

const {
  PanTool,
  TrackballRotateTool,
  ZoomTool,
  ToolGroupManager,
  Enums: csToolsEnums,
} = cornerstoneTools;

const { ViewportType } = Enums;
const { MouseBindings } = csToolsEnums;

const renderingEngineId = 'myRenderingEngine';
const viewportId1 = 'POLYDATA_SAGITTAL_ORTHO';
const viewportId2 = 'POLYDATA_SAGITTAL_STERO';
const viewportIds = [viewportId1, viewportId2];

// ======== Set up page ======== //
setTitleAndDescription(
  'Manipulation Tools with Poly Data in a Volume Viewport API',
  'Demonstrates how to interact with a Volume viewport (Pan, Zoom, Rotate) by mouse events.'
);

const size = '750px';
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

function getSphereActor({
  center,
  radius,
  phiResolution,
  thetaResolution,
  opacity,
  edgeVisibility,
}) {
  const sphereSource = vtkSphereSource.newInstance({
    center,
    radius,
    phiResolution,
    thetaResolution,
  });

  const actor = vtkActor.newInstance();
  const mapper = vtkMapper.newInstance();

  actor.getProperty().setEdgeVisibility(edgeVisibility);
  actor.getProperty().setOpacity(opacity);

  mapper.setInputConnection(sphereSource.getOutputPort());
  actor.setMapper(mapper);

  return actor;
}

/**
 * Runs the demo
 */
async function run() {
  // Init Cornerstone and related libraries
  await csRenderInit();
  await csToolsInit();

  const toolGroupId = 'NAVIGATION_TOOL_GROUP_ID';

  // Add tools to Cornerstone3D
  cornerstoneTools.addTool(PanTool);
  cornerstoneTools.addTool(TrackballRotateTool);
  cornerstoneTools.addTool(ZoomTool);

  // Define a tool group, which defines how mouse events map to tool commands for
  // Any viewport using the group
  const toolGroup = ToolGroupManager.createToolGroup(toolGroupId);
  // Add tools to the tool group
  toolGroup.addTool(PanTool.toolName);
  toolGroup.addTool(TrackballRotateTool.toolName);
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

  toolGroup.setToolActive(TrackballRotateTool.toolName, {
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
      type: ViewportType.VOLUME_3D,
      element: element1,
      defaultOptions: {
        orientation: Enums.OrientationAxis.SAGITTAL,
        background: <Types.Point3>[0.2, 0, 0.2],
      },
    },
    {
      viewportId: viewportId2,
      type: ViewportType.VOLUME_3D,
      element: element2,
      defaultOptions: {
        parallelProjection: false,
        orientation: Enums.OrientationAxis.SAGITTAL,
        background: <Types.Point3>[0, 0.2, 0.2],
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

    const actor = getSphereActor({
      center: [0, 0, 0],
      radius: 1,
      phiResolution: 20,
      thetaResolution: 20,
      opacity: 1,
      edgeVisibility: true,
    });

    viewport.setActors([{ uid: 'spherePolyData', actor }]);

    // Render the image
    viewport.render();
  });
}

run();
