import type { Types } from '@cornerstonejs/core';
import { eventTarget, RenderingEngine, Enums } from '@cornerstonejs/core';
import {
  initDemo,
  createImageIdsAndCacheMetaData,
  setTitleAndDescription,
  addDropdownToToolbar,
} from '../../../../utils/demo/helpers';
import * as cornerstoneTools from '@cornerstonejs/tools';
import { KeyboardBindings } from '../../src/enums';
import { StackScrollOutOfBoundsEvent } from 'core/src/types/EventTypes';

// This is for debugging purposes
console.warn(
  'Click on index.ts to open source code for this example --------->'
);

const {
  PanTool,
  WindowLevelTool,
  StackScrollTool,
  ZoomTool,
  PlanarRotateTool,
  ToolGroupManager,
  Enums: csToolsEnums,
} = cornerstoneTools;

const { ViewportType } = Enums;
const { MouseBindings } = csToolsEnums;

const toolGroupId = 'STACK_TOOL_GROUP_ID';
const leftClickTools = [
  WindowLevelTool.toolName,
  PlanarRotateTool.toolName,
  StackScrollTool.toolName,
];
const defaultLeftClickTool = leftClickTools[0];
let currentLeftClickTool = leftClickTools[0];

// ======== Set up page ======== //
setTitleAndDescription(
  'Basic Stack Manipulation',
  'Manipulation tools for a stack viewport'
);

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
  'Middle Click: Pan\nRight Click: Zoom\n Mouse Wheel: Stack Scroll\n Shift or Primary + Wheel: Planar Rotate';

content.append(instructions);
// ============================= //

addDropdownToToolbar({
  options: {
    values: leftClickTools,
    defaultValue: defaultLeftClickTool,
  },
  onSelectedValueChange: (selectedValue) => {
    const toolGroup = ToolGroupManager.getToolGroup(toolGroupId);

    toolGroup.setToolPassive(currentLeftClickTool);

    toolGroup.setToolActive(<string>selectedValue, {
      bindings: [
        {
          mouseButton: MouseBindings.Primary, // Left Click
        },
      ],
    });

    currentLeftClickTool = selectedValue;
  },
});

const lastEvents = [];
const lastEventsDiv = document.createElement('div');

content.appendChild(lastEventsDiv);

function updateLastEvents(number, eventName, detail) {
  if (lastEvents.length > 4) {
    lastEvents.pop();
  }

  lastEvents.unshift({ number, eventName, detail });

  // Display
  lastEventsDiv.innerHTML = '';

  lastEvents.forEach((le) => {
    const element = document.createElement('p');

    element.style.border = '1px solid black';
    element.innerText = le.number + ' ' + le.eventName + '\n\n' + le.detail;

    lastEventsDiv.appendChild(element);
  });
}

let eventNumber = 1;

const { STACK_SCROLL_OUT_OF_BOUNDS } = Enums.Events;

eventTarget.addEventListener(STACK_SCROLL_OUT_OF_BOUNDS, ((
  evt: StackScrollOutOfBoundsEvent
) => {
  updateLastEvents(
    eventNumber,
    STACK_SCROLL_OUT_OF_BOUNDS,
    JSON.stringify(evt.detail)
  );
  eventNumber++;
}) as EventListener);

/**
 * Runs the demo
 */
async function run() {
  // Init Cornerstone and related libraries
  await initDemo();

  // Add tools to Cornerstone3D
  cornerstoneTools.addTool(PanTool);
  cornerstoneTools.addTool(WindowLevelTool);
  cornerstoneTools.addTool(StackScrollTool);
  cornerstoneTools.addTool(ZoomTool);
  cornerstoneTools.addTool(PlanarRotateTool);

  // Define a tool group, which defines how mouse events map to tool commands for
  // Any viewport using the group
  const toolGroup = ToolGroupManager.createToolGroup(toolGroupId);

  // Add tools to the tool group
  toolGroup.addTool(WindowLevelTool.toolName);
  toolGroup.addTool(PanTool.toolName);
  toolGroup.addTool(ZoomTool.toolName);
  toolGroup.addTool(StackScrollTool.toolName, { loop: false });
  toolGroup.addTool(PlanarRotateTool.toolName);

  // Set the initial state of the tools, here all tools are active and bound to
  // Different mouse inputs
  toolGroup.setToolActive(defaultLeftClickTool, {
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

  // The Stack Scroll mouse wheel is a tool using the `mouseWheelCallback`
  // and needs to be registered against the 'Wheel' binding.
  toolGroup.setToolActive(StackScrollTool.toolName, {
    bindings: [
      {
        mouseButton: MouseBindings.Wheel, // Wheel Mouse
      },
    ],
  });
  toolGroup.setToolActive(PlanarRotateTool.toolName, {
    bindings: [
      {
        mouseButton: MouseBindings.Wheel, // Shift Wheel Mouse
        modifierKey: KeyboardBindings.Shift,
      },
      {
        mouseButton: MouseBindings.Wheel_Primary, // Left Click+Wheel Mouse
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

  cornerstoneTools.utilities.stackPrefetch.enable(viewport.element);

  // Render the image
  viewport.render();
}

run();
