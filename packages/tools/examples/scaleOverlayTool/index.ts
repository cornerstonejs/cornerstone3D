import { Types, Enums, RenderingEngine } from '@cornerstonejs/core';
import {
  initDemo,
  createImageIdsAndCacheMetaData,
  setTitleAndDescription,
  addDropdownToToolbar,
} from '../../../../utils/demo/helpers';
import * as cornerstoneTools from '@cornerstonejs/tools';

// This is for debugging purposes
console.warn(
  'Click on index.ts to open source code for this example --------->'
);

const {
  PanTool,
  ZoomTool,
  ToolGroupManager,
  ScaleOverlayTool,
  LengthTool,
  StackScrollMouseWheelTool,
  Enums: csToolsEnums,
} = cornerstoneTools;

const { ViewportType } = Enums;
const { MouseBindings } = csToolsEnums;

// ======== Set up page ======== //
setTitleAndDescription(
  'Scale Overlay Tool',
  'Set scale location using dropdown menu, zoom by holding right mouse down'
);
const viewportGrid = document.createElement('div');

viewportGrid.style.display = 'flex';
viewportGrid.style.display = 'flex';
viewportGrid.style.flexDirection = 'row';

const content = document.getElementById('content');
const element = document.createElement('div');
const element2 = document.createElement('div');

// Disable right click context menu so we can have right click tools
element.oncontextmenu = (e) => e.preventDefault();
element2.oncontextmenu = (e) => e.preventDefault();

element.id = 'cornerstone-element';
element.style.width = '500px';
element.style.height = '500px';

element2.id = 'cornerstone-element';
element2.style.width = '500px';
element2.style.height = '500px';

viewportGrid.appendChild(element);
viewportGrid.appendChild(element2);
content.appendChild(viewportGrid);

const instructions = document.createElement('p');
instructions.innerText =
  'Left Click: Length Tool\nRight Click: Zoom\n Mouse Wheel: Stack Scroll';

content.append(instructions);
// ============================= //

const toolGroupId = 'STACK_TOOL_GROUP_ID';

// add dropdown tool bar to select scale location
const scaleLocations = ['bottom', 'top', 'left', 'right'];
let currentScaleLocation = scaleLocations[0];
let toolGroup;

addDropdownToToolbar({
  options: { values: scaleLocations, defaultValue: scaleLocations[0] },
  onSelectedValueChange: (newSelectedScaleLocation) => {
    currentScaleLocation = newSelectedScaleLocation as string;

    toolGroup.setToolConfiguration(
      ScaleOverlayTool.toolName,
      {
        scaleLocation: currentScaleLocation,
      },
      true //overwrite
    );

    toolGroup.setToolEnabled(ScaleOverlayTool.toolName);
  },
});

/**
 * Runs the demo
 */
async function run() {
  // Init Cornerstone and related libraries
  await initDemo();

  // Add tools to Cornerstone3D
  cornerstoneTools.addTool(PanTool);
  cornerstoneTools.addTool(ZoomTool);
  cornerstoneTools.addTool(ScaleOverlayTool);
  cornerstoneTools.addTool(LengthTool);
  cornerstoneTools.addTool(StackScrollMouseWheelTool);

  // Create a stack viewport
  // Define a tool group, which defines how mouse events map to tool commands for
  // Any viewport using the group
  toolGroup = ToolGroupManager.createToolGroup(toolGroupId);

  // Add the tools to the tool group, TODO: add scaleOverlayTool
  toolGroup.addTool(PanTool.toolName);
  toolGroup.addTool(ZoomTool.toolName);
  toolGroup.addTool(LengthTool.toolName);
  toolGroup.addTool(StackScrollMouseWheelTool.toolName);
  toolGroup.addTool(ScaleOverlayTool.toolName);

  // Set the initial state of the tools, here we set one tool active on left click.
  // This means left click will draw that tool.

  toolGroup.setToolActive(LengthTool.toolName, {
    bindings: [
      {
        mouseButton: MouseBindings.Primary, // Left click
      },
    ],
  });

  toolGroup.setToolActive(ZoomTool.toolName, {
    bindings: [
      {
        mouseButton: MouseBindings.Secondary, //
      },
    ],
  });

  toolGroup.setToolActive(StackScrollMouseWheelTool.toolName);

  toolGroup.setToolEnabled(ScaleOverlayTool.toolName);

  // Get Cornerstone imageIds and fetch metadata into RAM
  const imageIds = await createImageIdsAndCacheMetaData({
    StudyInstanceUID:
      '1.3.6.1.4.1.14519.5.2.1.7311.5101.158323547117540061132729905711',
    SeriesInstanceUID:
      '1.3.6.1.4.1.14519.5.2.1.7311.5101.250911858840767891342974687368',
    wadoRsRoot: 'https://domvja9iplmyu.cloudfront.net/dicomweb',
  });

  const imageIds2 = await createImageIdsAndCacheMetaData({
    StudyInstanceUID:
      '1.3.6.1.4.1.14519.5.2.1.7009.2403.334240657131972136850343327463',
    SeriesInstanceUID:
      '1.3.6.1.4.1.14519.5.2.1.7009.2403.226151125820845824875394858561',
    wadoRsRoot: 'https://d3t6nz73ql33tx.cloudfront.net/dicomweb',
  });
  // Instantiate a rendering engine
  const renderingEngineId = 'myRenderingEngine';
  const renderingEngine = new RenderingEngine(renderingEngineId);

  const viewportId = 'CT_STACK';
  const viewportId2 = 'CT_STACK2';

  const viewportInput = {
    viewportId,
    type: ViewportType.STACK,
    element,
    defaultOptions: {
      background: <Types.Point3>[0.2, 0, 0.2],
    },
  };
  const viewportInput2 = {
    viewportId: viewportId2,
    type: ViewportType.STACK,
    element: element2,
    defaultOptions: {
      background: <Types.Point3>[0.2, 0, 0.2],
    },
  };

  renderingEngine.enableElement(viewportInput);
  renderingEngine.enableElement(viewportInput2);

  // Set the tool group on the viewport
  toolGroup.addViewport(viewportId, renderingEngineId);
  toolGroup.addViewport(viewportId2, renderingEngineId);

  // Get the stack viewport that was created
  const viewport = <Types.IStackViewport>(
    renderingEngine.getViewport(viewportId)
  );
  const viewport2 = <Types.IStackViewport>(
    renderingEngine.getViewport(viewportId2)
  );

  // Define a stack containing a single image
  const stack = [imageIds[0], imageIds[1], imageIds[2]];
  const stack2 = [imageIds2[0], imageIds2[1], imageIds2[2]];

  // Set the stack on the viewport
  viewport.setStack(stack);
  viewport2.setStack(stack2);

  // Render the image
  viewport.render();
  viewport2.render();
}

run();
