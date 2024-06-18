import { RenderingEngine, Types, Enums } from '@cornerstonejs/core';
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
  WindowLevelTool,
  LengthTool,
  RectangleROITool,
  BidirectionalTool,
  ZoomTool,
  PanTool,
  StackScrollTool,
  ToolGroupManager,
  Enums: csToolsEnums,
} = cornerstoneTools;

const { ViewportType } = Enums;
const { MouseBindings, KeyboardBindings } = csToolsEnums;

// ======== Set up page ======== //
setTitleAndDescription(
  'Tools on Modifier Keys',
  'Here we demonstrate how we add modifier keys to tools'
);

const content = document.getElementById('content');
const element = document.createElement('div');

element.tabIndex = -1;

// Disable right click context menu so we can have right click tools
element.oncontextmenu = (e) => e.preventDefault();

element.id = 'cornerstone-element';
element.style.width = '500px';
element.style.height = '500px';

content.appendChild(element);

const instructions = document.createElement('p');
instructions.innerText = `
- Single touch is equivalent to left click.
- Left or Meta+Left for stack scroll.
- Right or Option to use the Window/Level tool.
- Center or Ctrl to Pan.
- Shift to Zoom.
- Shift/Ctrl click to use the Length tool.
- Ctrl/Alt click to use the Bidirectional tool.
- Shift/Alt + Left click to use the RectangleROI tool.
`;

content.append(instructions);
// ============================= //

const toolGroupId = 'STACK_TOOL_GROUP_ID';

/**
 * Runs the demo
 */
async function run() {
  // Init Cornerstone and related libraries
  await initDemo();

  // Add tools to Cornerstone3D
  cornerstoneTools.addTool(WindowLevelTool);
  cornerstoneTools.addTool(LengthTool);
  cornerstoneTools.addTool(RectangleROITool);
  cornerstoneTools.addTool(BidirectionalTool);
  cornerstoneTools.addTool(StackScrollTool);
  cornerstoneTools.addTool(PanTool);
  cornerstoneTools.addTool(ZoomTool);

  // Define a tool group, which defines how mouse events map to tool commands for
  // Any viewport using the group
  const toolGroup = ToolGroupManager.createToolGroup(toolGroupId);

  // Add the tools to the tool group
  toolGroup.addTool(WindowLevelTool.toolName);
  toolGroup.addTool(LengthTool.toolName);
  toolGroup.addTool(RectangleROITool.toolName);
  toolGroup.addTool(BidirectionalTool.toolName);
  toolGroup.addTool(StackScrollTool.toolName);
  toolGroup.addTool(PanTool.toolName);
  toolGroup.addTool(ZoomTool.toolName);

  // Set the initial state of the tools, here we set one tool active on left click.
  // This means left click will draw that tool.
  toolGroup.setToolActive(StackScrollTool.toolName, {
    bindings: [
      {
        mouseButton: MouseBindings.Primary, // Left Click
      },
      {
        mouseButton: MouseBindings.Primary, // Left Click
        modifierKey: KeyboardBindings.Meta,
      },
      {
        numTouchPoints: 1,
        modifierKey: KeyboardBindings.Meta,
      },
    ],
  });
  toolGroup.setToolActive(WindowLevelTool.toolName, {
    bindings: [
      {
        mouseButton: MouseBindings.Secondary, // Right Click
      },
      {
        mouseButton: MouseBindings.Primary, // Left Click
        modifierKey: KeyboardBindings.Alt,
      },
      {
        numTouchPoints: 1,
        modifierKey: KeyboardBindings.Alt,
      },
    ],
  });
  toolGroup.setToolActive(PanTool.toolName, {
    bindings: [
      {
        mouseButton: MouseBindings.Primary_And_Secondary,
      },
      {
        mouseButton: MouseBindings.Auxiliary, // Right Click
      },
      {
        mouseButton: MouseBindings.Primary, // Left Click
        modifierKey: KeyboardBindings.Ctrl,
      },
      {
        numTouchPoints: 1,
        modifierKey: KeyboardBindings.Ctrl,
      },
    ],
  });
  toolGroup.setToolActive(ZoomTool.toolName, {
    bindings: [
      {
        mouseButton: MouseBindings.Primary, // Left Click
        modifierKey: KeyboardBindings.Shift,
      },
      {
        numTouchPoints: 1,
        modifierKey: KeyboardBindings.Shift,
      },
    ],
  });
  toolGroup.setToolActive(LengthTool.toolName, {
    bindings: [
      {
        mouseButton: MouseBindings.Primary, // Shift + Left Click
        modifierKey: KeyboardBindings.ShiftCtrl,
      },
      {
        numTouchPoints: 1,
        modifierKey: KeyboardBindings.ShiftCtrl,
      },
    ],
  });
  toolGroup.setToolActive(RectangleROITool.toolName, {
    bindings: [
      {
        mouseButton: MouseBindings.Primary, // Shift/Alt + Left Click
        modifierKey: KeyboardBindings.ShiftAlt,
      },
    ],
  });
  toolGroup.setToolActive(BidirectionalTool.toolName, {
    bindings: [
      {
        mouseButton: MouseBindings.Primary, // Ctrl/Alt + Left Click
        modifierKey: KeyboardBindings.CtrlAlt,
      },
    ],
  });

  // Get Cornerstone imageIds and fetch metadata into RAM
  const imageIds = await createImageIdsAndCacheMetaData({
    StudyInstanceUID:
      '1.3.6.1.4.1.14519.5.2.1.7009.2403.334240657131972136850343327463',
    SeriesInstanceUID:
      '1.3.6.1.4.1.14519.5.2.1.7009.2403.226151125820845824875394858561',
    wadoRsRoot: 'https://d3t6nz73ql33tx.cloudfront.net/dicomweb',
  });

  // Instantiate a rendering engine
  const renderingEngineId = 'myRenderingEngine';
  const renderingEngine = new RenderingEngine(renderingEngineId);

  // Create a stack viewport
  const viewportId = 'CT_STACK';
  const viewportInput = {
    viewportId,
    type: ViewportType.STACK,
    element,
    defaultOptions: {
      background: <Types.Point3>[0.2, 0, 0.2],
    },
  };

  renderingEngine.enableElement(viewportInput);

  // Set the tool group on the viewport
  toolGroup.addViewport(viewportId, renderingEngineId);

  // Get the stack viewport that was created
  const viewport = <Types.IStackViewport>(
    renderingEngine.getViewport(viewportId)
  );

  // Set the stack on the viewport
  viewport.setStack(imageIds);

  // Render the image
  viewport.render();
}

run();
