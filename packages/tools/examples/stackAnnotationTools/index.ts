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

const {
  LengthTool,
  ProbeTool,
  RectangleROITool,
  EllipticalROITool,
  BidirectionalTool,
  AngleTool,
  CobbAngleTool,
  ToolGroupManager,
  ArrowAnnotateTool,
  Enums: csToolsEnums,
} = cornerstoneTools;

const { ViewportType } = Enums;
const { MouseBindings } = csToolsEnums;

// ======== Set up page ======== //
setTitleAndDescription(
  'Annotation Tools Stack',
  'Annotation tools for a stack viewport'
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
instructions.innerText = 'Left Click to use selected tool';

content.append(instructions);
// ============================= //

const toolGroupId = 'STACK_TOOL_GROUP_ID';

const toolsNames = [
  LengthTool.toolName,
  ProbeTool.toolName,
  RectangleROITool.toolName,
  EllipticalROITool.toolName,
  BidirectionalTool.toolName,
  AngleTool.toolName,
  CobbAngleTool.toolName,
  ArrowAnnotateTool.toolName,
];
let selectedToolName = toolsNames[0];

addDropdownToToolbar({
  options: { values: toolsNames, defaultValue: selectedToolName },
  onSelectedValueChange: (newSelectedToolNameAsStringOrNumber) => {
    const newSelectedToolName = String(newSelectedToolNameAsStringOrNumber);
    const toolGroup = ToolGroupManager.getToolGroup(toolGroupId);

    // Set the new tool active
    toolGroup.setToolActive(newSelectedToolName, {
      bindings: [
        {
          mouseButton: MouseBindings.Primary, // Left Click
        },
      ],
    });

    // Set the old tool passive
    toolGroup.setToolPassive(selectedToolName);

    selectedToolName = <string>newSelectedToolName;
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
  cornerstoneTools.addTool(ProbeTool);
  cornerstoneTools.addTool(RectangleROITool);
  cornerstoneTools.addTool(EllipticalROITool);
  cornerstoneTools.addTool(BidirectionalTool);
  cornerstoneTools.addTool(AngleTool);
  cornerstoneTools.addTool(CobbAngleTool);
  cornerstoneTools.addTool(ArrowAnnotateTool);

  // Define a tool group, which defines how mouse events map to tool commands for
  // Any viewport using the group
  const toolGroup = ToolGroupManager.createToolGroup(toolGroupId);

  // Add the tools to the tool group
  toolGroup.addTool(LengthTool.toolName);
  toolGroup.addTool(ProbeTool.toolName);
  toolGroup.addTool(RectangleROITool.toolName);
  toolGroup.addTool(EllipticalROITool.toolName);
  toolGroup.addTool(BidirectionalTool.toolName);
  toolGroup.addTool(AngleTool.toolName);
  toolGroup.addTool(CobbAngleTool.toolName);
  toolGroup.addTool(ArrowAnnotateTool.toolName);

  // Set the initial state of the tools, here we set one tool active on left click.
  // This means left click will draw that tool.
  toolGroup.setToolActive(LengthTool.toolName, {
    bindings: [
      {
        mouseButton: MouseBindings.Primary, // Left Click
      },
    ],
  });
  // We set all the other tools passive here, this means that any state is rendered, and editable
  // But aren't actively being drawn (see the toolModes example for information)
  toolGroup.setToolPassive(ProbeTool.toolName);
  toolGroup.setToolPassive(RectangleROITool.toolName);
  toolGroup.setToolPassive(EllipticalROITool.toolName);
  toolGroup.setToolPassive(BidirectionalTool.toolName);
  toolGroup.setToolPassive(AngleTool.toolName);
  toolGroup.setToolPassive(CobbAngleTool.toolName);
  toolGroup.setToolPassive(ArrowAnnotateTool.toolName);

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
  const stack = [imageIds[0]];

  // Set the stack on the viewport
  viewport.setStack(stack);

  // Render the image
  viewport.render();
}

run();
