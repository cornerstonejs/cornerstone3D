import { RenderingEngine, Types, Enums } from '@cornerstonejs/core';
import {
  initDemo,
  createImageIdsAndCacheMetaData,
  setTitleAndDescription,
} from '../../../../utils/demo/helpers';
import * as cornerstoneTools from '@cornerstonejs/tools';
import { sortImageIds } from './utils';

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

async function getImageStacks() {
  // Get Cornerstone imageIds for the source data and fetch metadata into RAM
  const wadoRsRoot = 'https://d33do7qe4w26qo.cloudfront.net/dicomweb';
  const studyInstanceUID =
    '1.3.6.1.4.1.25403.345050719074.3824.20170125095258.1';
  const seriesInstanceUIDs = [
    '1.3.6.1.4.1.25403.345050719074.3824.20170125095258.7',
    '1.3.6.1.4.1.25403.345050719074.3824.20170125095319.5',
    '1.3.6.1.4.1.25403.345050719074.3824.20170125095312.3',
  ];
  const axialImageIds = await createImageIdsAndCacheMetaData({
    StudyInstanceUID: studyInstanceUID,
    SeriesInstanceUID: seriesInstanceUIDs[0],
    wadoRsRoot,
  });

  const sagittalImageIds = await createImageIdsAndCacheMetaData({
    StudyInstanceUID: studyInstanceUID,
    SeriesInstanceUID: seriesInstanceUIDs[1],
    wadoRsRoot,
  });

  const coronalImageIds = await createImageIdsAndCacheMetaData({
    StudyInstanceUID: studyInstanceUID,
    SeriesInstanceUID: seriesInstanceUIDs[2],
    wadoRsRoot,
  });

  const imageStacks = [
    sortImageIds(axialImageIds),
    sortImageIds(sagittalImageIds),
    sortImageIds(coronalImageIds),
  ];
  return imageStacks;
}

const toolGroupId = 'MY_TOOLGROUP_ID';

// ======== Set up page ======== //
setTitleAndDescription(
  'OverlayGrid',
  'Here we demonstrate overlay grid tool working. The reference lines for all the images in axial series is displayed in the sagittal and coronal series.'
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
  const orientations = [
    Enums.OrientationAxis.AXIAL,
    Enums.OrientationAxis.SAGITTAL,
    Enums.OrientationAxis.CORONAL,
  ];

  // Create the viewports
  const viewportInputArray = [];
  for (let i = 0; i < elements.length; i++) {
    viewportInputArray[i] = {
      viewportId: viewportIds[i],
      type: ViewportType.STACK,
      element: elements[i],
      defaultOptions: {
        orientation: orientations[i],
        background: <Types.Point3>[0, 0, 0],
      },
    };
  }
  renderingEngine.setViewports(viewportInputArray);

  const imageStacks = await getImageStacks();

  // Define tool groups to add the segmentation display tool to
  const toolGroup = ToolGroupManager.createToolGroup(toolGroupId);

  const viewports = [];
  for (let i = 0; i < viewportIds.length; i++) {
    toolGroup.addViewport(viewportIds[i], renderingEngineId);
    viewports[i] = <Types.IStackViewport>(
      renderingEngine.getViewport(viewportIds[i])
    );

    await viewports[i].setStack(
      imageStacks[i],
      Math.floor(imageStacks[i].length / 2)
    );
  }

  // Manipulation Tools
  toolGroup.addTool(StackScrollMouseWheelTool.toolName);
  toolGroup.addTool(OverlayGridTool.toolName, {
    sourceImageIds: imageStacks[0],
  });
  toolGroup.addTool(ZoomTool.toolName);
  toolGroup.addTool(PanTool.toolName);

  toolGroup.setToolEnabled(OverlayGridTool.toolName);
  toolGroup.setToolActive(StackScrollMouseWheelTool.toolName);
  toolGroup.setToolActive(PanTool.toolName, {
    bindings: [
      {
        mouseButton: MouseBindings.Primary, // Left Click
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
