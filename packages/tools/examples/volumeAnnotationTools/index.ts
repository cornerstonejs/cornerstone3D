import type { Types } from '@cornerstonejs/core';
import {
  Enums,
  RenderingEngineV2,
  PlanarViewportV2,
  utilities,
} from '@cornerstonejs/core';
import {
  initDemo,
  createImageIdsAndCacheMetaData,
  ctVoiRange,
  setTitleAndDescription,
} from '../../../../utils/demo/helpers';
import * as cornerstoneTools from '@cornerstonejs/tools';

const {
  LengthTool,
  PanTool,
  ToolGroupManager,
  StackScrollTool,
  ZoomTool,
  Enums: csToolsEnums,
} = cornerstoneTools;

const { MouseBindings } = csToolsEnums;
const dataId = 'ct-volume-annotation-planar-v2';
const planarViewportType = Enums.ViewportType?.PLANAR_V2 || 'planarV2';

// ======== Set up page ======== //
setTitleAndDescription(
  'Annotation Tools On Volumes With ViewportV2',
  'Here we demonstrate how annotation tools can be drawn and rendered on axial, sagittal, and coronal PlanarViewportV2 viewports. Add cpu=true in the URL to force CPU rendering.'
);

const size = '500px';
const content = document.getElementById('content');
const viewportGrid = document.createElement('div');

viewportGrid.style.display = 'flex';
viewportGrid.style.display = 'flex';
viewportGrid.style.flexDirection = 'row';

const element1 = document.createElement('div');
const element2 = document.createElement('div');
const element3 = document.createElement('div');
element1.oncontextmenu = () => false;
element2.oncontextmenu = () => false;
element3.oncontextmenu = () => false;

element1.style.width = size;
element1.style.height = size;
element2.style.width = size;
element2.style.height = size;
element3.style.width = size;
element3.style.height = size;

viewportGrid.appendChild(element1);
viewportGrid.appendChild(element2);
viewportGrid.appendChild(element3);

content.appendChild(viewportGrid);

const instructions = document.createElement('p');
instructions.innerText =
  'Left click to draw length measurements on any viewport. Use the mouse wheel to scroll, middle drag to pan, and right drag to zoom. Add cpu=true in the URL to force CPU rendering.';

content.append(instructions);
// ============================= //

/**
 * Runs the demo
 */
async function run() {
  // Init Cornerstone and related libraries
  const config = (window as any).IS_TILED
    ? { core: { renderingEngineMode: 'tiled' } }
    : {};
  await initDemo(config);

  const toolGroupId = 'STACK_TOOL_GROUP_ID';

  // Add tools to Cornerstone3D
  cornerstoneTools.addTool(LengthTool);
  cornerstoneTools.addTool(PanTool);
  cornerstoneTools.addTool(ZoomTool);
  cornerstoneTools.addTool(StackScrollTool);

  // Define a tool group, which defines how mouse events map to tool commands for
  // Any viewport using the group
  const toolGroup = ToolGroupManager.createToolGroup(toolGroupId);

  // Add the tools to the tool group
  toolGroup.addTool(LengthTool.toolName);
  toolGroup.addTool(PanTool.toolName);
  toolGroup.addTool(ZoomTool.toolName);
  toolGroup.addTool(StackScrollTool.toolName);

  // Set the initial state of the tools, here we set one tool active on left click.
  // This means left click will draw that tool.
  toolGroup.setToolActive(LengthTool.toolName, {
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
    bindings: [
      {
        mouseButton: MouseBindings.Wheel, // Mouse Wheel
      },
    ],
  });

  // Get Cornerstone imageIds and fetch metadata into RAM
  const imageIds = await createImageIdsAndCacheMetaData({
    StudyInstanceUID:
      '1.3.6.1.4.1.14519.5.2.1.7009.2403.334240657131972136850343327463',
    SeriesInstanceUID:
      '1.3.6.1.4.1.14519.5.2.1.7009.2403.226151125820845824875394858561',
    wadoRsRoot: 'https://d14fa38qiwhyfd.cloudfront.net/dicomweb',
  });

  // Instantiate a rendering engine
  const renderingEngineId = 'myRenderingEngine';
  const renderingEngine = new RenderingEngineV2(renderingEngineId);

  // Create the viewports
  const viewportIds = [
    'CT_AXIAL_PLANAR_V2',
    'CT_SAGITTAL_PLANAR_V2',
    'CT_CORONAL_PLANAR_V2',
  ];

  const viewportInputArray = [
    {
      viewportId: viewportIds[0],
      type: planarViewportType,
      element: element1,
      defaultOptions: {
        background: <Types.Point3>[0.2, 0, 0.2],
      },
    },
    {
      viewportId: viewportIds[1],
      type: planarViewportType,
      element: element2,
      defaultOptions: {
        background: <Types.Point3>[0.2, 0, 0.2],
      },
    },
    {
      viewportId: viewportIds[2],
      type: planarViewportType,
      element: element3,
      defaultOptions: {
        background: <Types.Point3>[0.2, 0, 0.2],
      },
    },
  ];

  viewportInputArray.forEach((viewportInput) =>
    renderingEngine.enableViewport(viewportInput)
  );

  // Set the tool group on the viewports
  viewportIds.forEach((viewportId) =>
    toolGroup.addViewport(viewportId, renderingEngineId)
  );

  utilities.viewportV2DataSetMetadataProvider.add(dataId, {
    imageIds,
  });
  const viewports = viewportIds.map(
    (viewportId) => renderingEngine.getViewport(viewportId) as PlanarViewportV2
  );
  const orientations = [
    Enums.OrientationAxis.AXIAL,
    Enums.OrientationAxis.SAGITTAL,
    Enums.OrientationAxis.CORONAL,
  ] as const;

  await Promise.all(
    viewports.map((viewport, index) =>
      viewport.setDataIds([dataId], {
        orientation: orientations[index],
      })
    )
  );

  viewports.forEach((viewport) => {
    viewport.setProperties({
      voiRange: ctVoiRange,
    });
    viewport.render();
  });
}

run();
