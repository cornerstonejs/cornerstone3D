import { RenderingEngine, Types, Enums } from '@cornerstonejs/core';
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

const { LengthTool, ToolGroupManager, Enums: csToolsEnums } = cornerstoneTools;

const { MouseBindings, ToolModes } = csToolsEnums;
const { ViewportType } = Enums;

// ======== Set up page ======== //
setTitleAndDescription('Annotation Tool Modes', 'Annotation tools mode');

const content = document.getElementById('content');
const element = document.createElement('div');

// Disable right click context menu so we can have right click tools
element.oncontextmenu = (e) => e.preventDefault();

element.id = 'cornerstone-element';
element.style.width = '500px';
element.style.height = '500px';

content.appendChild(element);

const instructions = document.createElement('p');

const instructionText = {
  [ToolModes.Disabled]: `Disabled: When an annotation tool is disabled, existing annotations for that tool are hidden.`,
  [ToolModes.Enabled]: `Enabled: When an annotation tool is enabled, existing annotations for that tool are displayed but not interactable.`,
  [ToolModes.Passive]: `Passive: When an annotation tool is passive, existing annotations for that tool are displayed and interactable.`,
  [ToolModes.Active]: `Active: When an annotation tool is active, new annotations can be drawn on the viewport, and existing annotations for that tool are displayed and interactable.`,
};

instructions.innerText = instructionText[ToolModes.Active];

content.append(instructions);
// ============================= //

const toolGroupId = 'STACK_TOOL_GROUP_ID';

const toolModes = [
  ToolModes.Active,
  ToolModes.Passive,
  ToolModes.Enabled,
  ToolModes.Disabled,
];
const selectedToolMode = ToolModes.Active;

addDropdownToToolbar({
  options: { values: toolModes, defaultValue: selectedToolMode },
  onSelectedValueChange: (newToolMode) => {
    const toolGroup = ToolGroupManager.getToolGroup(toolGroupId);

    // Set the new tool active
    toolGroup[`setTool${newToolMode}`](LengthTool.toolName, {
      bindings: [
        {
          mouseButton: MouseBindings.Primary, // Left Click (only applies if active)
        },
      ],
    });

    instructions.innerText = instructionText[newToolMode];
  },
});

/**
 * Runs the demo
 */
async function run() {
  // Init Cornerstone and related libraries
  await initDemo();

  // Add tools to Cornerstone3D
  cornerstoneTools.addTool(LengthTool);

  // Define a tool group, which defines how mouse events map to tool commands for
  // Any viewport using the group
  const toolGroup = ToolGroupManager.createToolGroup(toolGroupId);

  // Add the tools to the tool group
  toolGroup.addTool(LengthTool.toolName);

  // Set the initial state of the tools, here we set one tool active on left click.
  // This means left click will draw that tool.
  toolGroup.setToolActive(LengthTool.toolName, {
    bindings: [
      {
        mouseButton: MouseBindings.Primary, // Left Click
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

  // Define a stack containing a single image
  const stack = [imageIds[0], imageIds[1], imageIds[2]];

  // Set the stack on the viewport
  viewport.setStack(stack);

  // Render the image
  viewport.render();
}

run();
