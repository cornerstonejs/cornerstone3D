import {
  RenderingEngine,
  Types,
  Enums,
  volumeLoader,
  setVolumesForViewports,
} from '@cornerstonejs/core';
import {
  initDemo,
  createImageIdsAndCacheMetaData,
  setTitleAndDescription,
} from '../../../../utils/demo/helpers/index.js';
import * as cornerstoneTools from '@cornerstonejs/tools';

// This is for debugging purposes
console.warn(
  'Click on index.ts to open source code for this example --------->'
);

const {
  ToolGroupManager,
  Enums: csToolsEnums,
  OverlayGridTool,
  ZoomTool,
  PanTool,
  StackScrollMouseWheelTool,
} = cornerstoneTools;

const { MouseBindings } = csToolsEnums;
const { ViewportType } = Enums;

const toolGroupId = 'MY_TOOLGROUP_ID';

// ======== Set up page ======== //
setTitleAndDescription(
  'OverlayGrid',
  'Here we demonstrate overlay grid tool working. The two viewports on the left are from the same CT series while the right viewport is from a PET series. '
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
const elements = [element1, element2, element3];

for (let i = 0; i < elements.length; i++) {
  elements[i].style.width = size;
  elements[i].style.height = size;
  // Disable right click context menu so we can have right click tools
  elements[i].oncontextmenu = (e) => e.preventDefault();
  viewportGrid.appendChild(elements[i]);
}

content.appendChild(viewportGrid);

const instructions = document.createElement('p');
instructions.innerText = `
Basic controls:
- Left click : pan images
- Right click : zoom images
  `;

content.append(instructions);

// ============================= //

const viewportIds = ['CT_AXIAL', 'CT_SAGITTAL', 'CT_CORONAL'];

/**
 * Runs the demo
 */
async function run() {
  // Init Cornerstone and related libraries
  await initDemo();

  // Add tools to Cornerstone3D
  cornerstoneTools.addTool(StackScrollMouseWheelTool);
  cornerstoneTools.addTool(OverlayGridTool);
  cornerstoneTools.addTool(PanTool);
  cornerstoneTools.addTool(ZoomTool);

  // Instantiate a rendering engine
  const renderingEngineId = 'myRenderingEngine';
  const renderingEngine = new RenderingEngine(renderingEngineId);

  const viewportInputArray: Types.PublicViewportInput[] = [
    {
      viewportId: viewportIds[0],
      type: ViewportType.STACK,
      element: elements[0],
      defaultOptions: {},
    },
    {
      viewportId: viewportIds[1],
      type: ViewportType.ORTHOGRAPHIC,
      element: elements[1],
      defaultOptions: {
        orientation: Enums.OrientationAxis.SAGITTAL,
      },
    },
    {
      viewportId: viewportIds[2],
      type: ViewportType.ORTHOGRAPHIC,
      element: elements[2],
      defaultOptions: {
        orientation: Enums.OrientationAxis.CORONAL,
      },
    },
  ];

  renderingEngine.setViewports(viewportInputArray);

  const ctStacks = await createImageIdsAndCacheMetaData({
    StudyInstanceUID:
      '1.3.6.1.4.1.14519.5.2.1.7009.2403.334240657131972136850343327463',
    SeriesInstanceUID:
      '1.3.6.1.4.1.14519.5.2.1.7009.2403.226151125820845824875394858561',
    wadoRsRoot: 'https://d3t6nz73ql33tx.cloudfront.net/dicomweb',
  });
  const ptStacks = await createImageIdsAndCacheMetaData({
    StudyInstanceUID:
      '1.3.6.1.4.1.14519.5.2.1.7009.2403.334240657131972136850343327463',
    SeriesInstanceUID:
      '1.3.6.1.4.1.14519.5.2.1.7009.2403.879445243400782656317561081015',
    wadoRsRoot: 'https://d3t6nz73ql33tx.cloudfront.net/dicomweb',
  });
  // Define tool groups to add the segmentation display tool to
  const toolGroup = ToolGroupManager.createToolGroup(toolGroupId);

  const stackViewport = <Types.IStackViewport>(
    renderingEngine.getViewport(viewportIds[0])
  );

  stackViewport.setStack(ctStacks);

  const ptVolumeId = 'myVolume-pt';
  const ctVolumeId = 'myVolume-ct';

  const ptVolume = await volumeLoader.createAndCacheVolume(ptVolumeId, {
    imageIds: ptStacks,
  });

  ptVolume.load();

  const ctVolume = await volumeLoader.createAndCacheVolume(ctVolumeId, {
    imageIds: ctStacks,
  });

  ctVolume.load();

  // set on the other two viewports
  await setVolumesForViewports(
    renderingEngine,
    [{ volumeId: ctVolumeId }],
    [viewportIds[1]]
  );

  await setVolumesForViewports(
    renderingEngine,
    [{ volumeId: ptVolumeId }],
    [viewportIds[2]]
  );

  toolGroup.addViewport(viewportIds[0], renderingEngine.id);
  toolGroup.addViewport(viewportIds[1], renderingEngine.id);
  toolGroup.addViewport(viewportIds[2], renderingEngine.id);

  // Manipulation Tools
  toolGroup.addTool(StackScrollMouseWheelTool.toolName);
  toolGroup.addTool(ZoomTool.toolName);
  toolGroup.addTool(PanTool.toolName);

  toolGroup.addTool(OverlayGridTool.toolName, {
    sourceImageIds: ctStacks,
  });

  toolGroup.setToolEnabled(OverlayGridTool.toolName);

  toolGroup.setToolActive(StackScrollMouseWheelTool.toolName);
  toolGroup.setToolActive(PanTool.toolName, {
    bindings: [
      {
        mouseButton: MouseBindings.Auxiliary, // Left Click
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

  // Render the image
  renderingEngine.renderViewports(viewportIds);
}

run();
