import { RenderingEngine, Types, Enums } from '@cornerstonejs/core';
import {
  addButtonToToolbar,
  initDemo,
  setTitleAndDescription,
} from '../../../../utils/demo/helpers';
import * as cornerstoneTools from '@cornerstonejs/tools';

// This is for debugging purposes
console.warn(
  'Click on index.ts to open source code for this example --------->'
);

const {
  PanTool,
  WindowLevelTool,
  ZoomTool,
  VideoRedactionTool,
  ToolGroupManager,
  Enums: csToolsEnums,
} = cornerstoneTools;

const { ViewportType } = Enums;
const { MouseBindings } = csToolsEnums;

const toolGroupId = 'STACK_TOOL_GROUP_ID';

// ======== Set up page ======== //
setTitleAndDescription('Basic Video Tools');

const content = document.getElementById('content');
const element = document.createElement('div');

// Disable right click context menu so we can have right click tools
element.oncontextmenu = (e) => e.preventDefault();

element.id = 'cornerstone-element';
element.style.width = '500px';
element.style.height = '500px';

content.appendChild(element);

const instructions = document.createElement('p');
instructions.innerText =
  'Middle Click: Pan\nRight Click: Zoom\n Mouse Wheel: Stack Scroll';

content.append(instructions);
// ============================= //

const renderingEngineId = 'myRenderingEngine';
const viewportId = 'CT_STACK';
let viewport;

addButtonToToolbar({
  id: 'play',
  title: 'Play',
  onClick() {
    viewport.play();
  },
});

addButtonToToolbar({
  id: 'Pause',
  title: 'pause',
  onClick() {
    viewport.pause();
  },
});
addButtonToToolbar({
  id: 'next',
  title: 'next',
  onClick() {
    viewport.next();
  },
});
addButtonToToolbar({
  id: 'previous',
  title: 'previous',
  onClick() {
    viewport.previous();
  },
});
addButtonToToolbar({
  id: 'jump',
  title: 'jump to 50',
  onClick() {
    viewport.setTime(50);
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
  cornerstoneTools.addTool(VideoRedactionTool);
  cornerstoneTools.addTool(ZoomTool);

  // Define a tool group, which defines how mouse events map to tool commands for
  // Any viewport using the group
  const toolGroup = ToolGroupManager.createToolGroup(toolGroupId);

  // Add tools to the tool group
  toolGroup.addTool(PanTool.toolName);
  toolGroup.addTool(ZoomTool.toolName);
  toolGroup.addTool(VideoRedactionTool.toolName);

  toolGroup.setToolActive(VideoRedactionTool.toolName, {
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

  // Get Cornerstone imageIds and fetch metadata into RAM

  // Instantiate a rendering engine
  const renderingEngine = new RenderingEngine(renderingEngineId);

  // Create a stack viewport

  const viewportInput = {
    viewportId,
    type: ViewportType.VIDEO,
    element,
    defaultOptions: {
      background: <Types.Point3>[0.2, 0, 0.2],
    },
  };

  renderingEngine.enableElement(viewportInput);

  // Get the stack viewport that was created
  viewport = <Types.IStackViewport>renderingEngine.getViewport(viewportId);

  toolGroup.addViewport(viewport.id, renderingEngineId);

  // Set the stack on the viewport
  await viewport.setVideo('http://localhost:3000/rendered.mp4');

  // Set the VOI of the stack
  // viewport.setProperties({ voiRange: ctVoiRange });

  // Render the image
  viewport.play();

  element.addEventListener(Enums.Events.IMAGE_RENDERED, (evt) => {
    console.debug(evt.detail.time);
  });
}

run();
