import type { Types } from '@cornerstonejs/core';
import {
  RenderingEngine,
  Enums,
  init as csRenderInit,
  geometryLoader,
  eventTarget,
} from '@cornerstonejs/core';
import { setTitleAndDescription } from '../../../../utils/demo/helpers';
import { init as csToolsInit } from '@cornerstonejs/tools';
import * as cornerstoneTools from '@cornerstonejs/tools';

geometryLoader.setOptions({
  beforeSend(xhr) {
    const headers = {
      // Authorization: 'Bearer YOUR_API_KEY',
    };
    return headers;
  },
});

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
const viewportId1 = 'POLYDATA_1';
const viewportId2 = 'POLYDATA_2';
const viewportId3 = 'POLYDATA_3';
const viewportId4 = 'POLYDATA_4';

// ======== Set up page ======== //
setTitleAndDescription(
  'Demonstrates how to load and display 3D meshes',
  'This example shows how to load and display 3D meshes using the mesh loader. It also demonstrates how to use the Pan, Rotate and Zoom tools.'
);

const width = '25%';
const height = '400px';
const content = document.getElementById('content');
const viewportGrid = document.createElement('div');

viewportGrid.style.display = 'flex';
viewportGrid.style.flexDirection = 'row';

const element1 = document.createElement('div');
const element2 = document.createElement('div');
const element3 = document.createElement('div');
const element4 = document.createElement('div');

element1.style.width = width;
element1.style.height = height;
element2.style.width = width;
element2.style.height = height;
element3.style.width = width;
element3.style.height = height;
element4.style.width = width;
element4.style.height = height;

// Disable right click context menu so we can have right click tools
element1.oncontextmenu = (e) => e.preventDefault();
element2.oncontextmenu = (e) => e.preventDefault();
element3.oncontextmenu = (e) => e.preventDefault();
element4.oncontextmenu = (e) => e.preventDefault();

viewportGrid.appendChild(element1);
viewportGrid.appendChild(element2);
viewportGrid.appendChild(element3);
viewportGrid.appendChild(element4);

content.appendChild(viewportGrid);

const instructions = document.createElement('p');
instructions.innerText = `
  Basic controls:
  - Left Click / Drag : Rotate
  - Middle Click / Drag : Pan
  - MouseWheel : Zoom
  `;

content.append(instructions);

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
        mouseButton: MouseBindings.Wheel, // Wheel
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
        background: <Types.RGB>[0.2, 0, 0.2],
      },
    },
    {
      viewportId: viewportId2,
      type: ViewportType.VOLUME_3D,
      element: element2,
      defaultOptions: {
        background: <Types.RGB>[0.2, 0.2, 0],
      },
    },
    {
      viewportId: viewportId3,
      type: ViewportType.VOLUME_3D,
      element: element3,
      defaultOptions: {
        background: <Types.RGB>[0.2, 0.2, 0.2],
      },
    },
    {
      viewportId: viewportId4,
      type: ViewportType.VOLUME_3D,
      element: element4,
      defaultOptions: {
        background: <Types.RGB>[0.4, 0.4, 0.4],
      },
    },
  ];

  renderingEngine.setViewports(viewportInputArray);

  // Set the tool group on the viewport
  toolGroup.addViewport(viewportId1, renderingEngineId);
  toolGroup.addViewport(viewportId2, renderingEngineId);
  toolGroup.addViewport(viewportId3, renderingEngineId);
  toolGroup.addViewport(viewportId4, renderingEngineId);

  eventTarget.addEventListener(Enums.Events.GEOMETRY_LOADED, (e) => {
    console.log('Geometry Loaded', e);
  });

  const mesh1 = await geometryLoader.loadAndCacheGeometry(
    'mesh:https://data.kitware.com/api/v1/file/5afd92e18d777f15ebe1ad73/download',
    {
      type: Enums.GeometryType.MESH,
      geometryData: {
        id: 'mesh1',
        format: Enums.MeshType.PLY,
      } as Types.MeshData,
    }
  );

  const viewport1 = <Types.IVolumeViewport>(
    renderingEngine.getViewport(viewportId1)
  );
  viewport1.setActors([
    { uid: mesh1.id, actor: (mesh1.data as Types.IMesh).defaultActor },
  ]);

  const mesh2 = await geometryLoader.loadAndCacheGeometry(
    'mesh:https://data.kitware.com/api/v1/file/5afd93238d777f15ebe1b113/download',
    {
      type: Enums.GeometryType.MESH,
      geometryData: {
        id: 'mesh2',
        format: Enums.MeshType.STL,
      } as Types.MeshData,
    }
  );

  const viewport2 = <Types.IVolumeViewport>(
    renderingEngine.getViewport(viewportId2)
  );

  viewport2.setActors([
    { uid: mesh2.id, actor: (mesh2.data as Types.IMesh).defaultActor },
  ]);
  viewport2.resetCamera();
  viewport2.render();

  const mesh3 = await geometryLoader.loadAndCacheGeometry(
    'mesh:https://data.kitware.com/api/v1/file/5c3c7daf8d777f072b02eaae/download',
    {
      type: Enums.GeometryType.MESH,
      geometryData: {
        id: 'mesh3',
        format: Enums.MeshType.OBJ,
      } as Types.MeshData,
    }
  );

  const viewport3 = <Types.IVolumeViewport>(
    renderingEngine.getViewport(viewportId3)
  );

  viewport3.setActors([
    { uid: mesh3.id, actor: (mesh3.data as Types.IMesh).defaultActor },
  ]);
  viewport3.resetCamera();
  viewport3.render();

  const mesh4 = await geometryLoader.loadAndCacheGeometry(
    'mesh:https://data.kitware.com/api/v1/file/59de9de58d777f31ac641dc6/download',
    {
      type: Enums.GeometryType.MESH,
      geometryData: {
        id: 'mesh4',
        format: Enums.MeshType.VTP,
      } as Types.MeshData,
    }
  );

  const viewport4 = <Types.IVolumeViewport>(
    renderingEngine.getViewport(viewportId4)
  );

  viewport4.setActors([
    { uid: mesh4.id, actor: (mesh4.data as Types.IMesh).defaultActor },
  ]);
  viewport4.resetCamera();
  viewport4.render();
}

run();
