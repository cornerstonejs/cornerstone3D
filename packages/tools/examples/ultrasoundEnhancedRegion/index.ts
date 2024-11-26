import type { Types } from '@cornerstonejs/core';
import { RenderingEngine, Enums } from '@cornerstonejs/core';
import {
  initDemo,
  createImageIdsAndCacheMetaData,
  setTitleAndDescription,
  addDropdownToToolbar,
  addToggleButtonToToolbar,
} from '../../../../utils/demo/helpers';
import * as cornerstoneTools from '@cornerstonejs/tools';

// This is for debugging purposes
console.warn(
  'Click on index.ts to open source code for this example --------->'
);

const {
  LengthTool,
  ProbeTool,
  ZoomTool,
  PanTool,
  UltrasoundDirectionalTool,
  ToolGroupManager,
  Enums: csToolsEnums,
} = cornerstoneTools;

const { ViewportType } = Enums;
const { MouseBindings } = csToolsEnums;
const renderingEngineId = 'myRenderingEngine';
const viewportId = 'CT_STACK';
const viewportId2 = 'CT_STACK2';

// ======== Set up page ======== //
setTitleAndDescription(
  'Ultrasound Enhanced Regions Length and Probe Tool and a new Ultrasound Directional Tool',
  'In this example, we demonstrate how to use the length and probe tools with ultrasound enhanced regions. You can use the dropdown to switch between different tools. The length tool examines the Ultrasound enhanced regions and accurately calculates the length in each region. If the annotation spans multiple regions, it identifies them and measures at the pixel level. The image on the right-hand side contains a combination of two regions, one on top and one at the bottom, which helps display the second and mm units correctly. By using the probe tool on the bottom region, you can accurately view the seconds and mm units. Additionally, the ultrasound differential tool, located at the bottom of the right-hand side image, displays the difference between two horizontal or vertical points.'
);

const content = document.getElementById('content');
content.style.display = 'flex';

const createCornerstoneElement = (id) => {
  const element = document.createElement('div');
  element.oncontextmenu = (e) => e.preventDefault(); // Disable right click context menu
  element.id = id;
  element.style.width = '500px';
  element.style.height = '500px';
  return element;
};

const element1 = createCornerstoneElement('cornerstone-element');
const element2 = createCornerstoneElement('cornerstone-element2');

content.appendChild(element1);
content.appendChild(element2);

const toolGroupId = 'STACK_TOOL_GROUP_ID';

const toolsNames = [
  LengthTool.toolName,
  ProbeTool.toolName,
  UltrasoundDirectionalTool.toolName,
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

addToggleButtonToToolbar({
  title: 'Display Both Axes Distances for the Ultrasound Directional Tool',
  onClick: (isOn) => {
    const toolGroup = ToolGroupManager.getToolGroup(toolGroupId);
    toolGroup.setToolConfiguration(UltrasoundDirectionalTool.toolName, {
      displayBothAxesDistances: isOn,
    });
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
  cornerstoneTools.addTool(ZoomTool);
  cornerstoneTools.addTool(PanTool);
  cornerstoneTools.addTool(UltrasoundDirectionalTool);

  // Define a tool group, which defines how mouse events map to tool commands for
  // Any viewport using the group
  const toolGroup = ToolGroupManager.createToolGroup(toolGroupId);

  // Add the tools to the tool group
  toolGroup.addTool(LengthTool.toolName);
  toolGroup.addTool(ProbeTool.toolName);
  toolGroup.addTool(ZoomTool.toolName);
  toolGroup.addTool(PanTool.toolName);
  toolGroup.addTool(UltrasoundDirectionalTool.toolName);

  // Set the initial state of the tools, here we set one tool active on left click.
  // This means left click will draw that tool.
  toolGroup.setToolActive(LengthTool.toolName, {
    bindings: [
      {
        mouseButton: MouseBindings.Primary, // Left Click
      },
    ],
  });
  toolGroup.setToolActive(ZoomTool.toolName, {
    bindings: [
      {
        mouseButton: MouseBindings.Secondary, // Left Click
      },
    ],
  });
  toolGroup.setToolActive(PanTool.toolName, {
    bindings: [
      {
        mouseButton: MouseBindings.Auxiliary, // Left Click
      },
    ],
  });
  // We set all the other tools passive here, this means that any state is rendered, and editable
  // But aren't actively being drawn (see the toolModes example for information)
  toolGroup.setToolPassive(ProbeTool.toolName);

  // Get Cornerstone imageIds and fetch metadata into RAM
  const imageIds = await createImageIdsAndCacheMetaData({
    StudyInstanceUID:
      '1.3.6.1.4.1.14519.5.2.1.1188.2803.137585363493444318569098508293',
    SeriesInstanceUID:
      '1.3.6.1.4.1.14519.5.2.1.1188.2803.699272945123913604672897602509',
    SOPInstanceUID:
      '1.3.6.1.4.1.14519.5.2.1.1188.2803.295285318555680716246271899544',
    wadoRsRoot: 'https://d3t6nz73ql33tx.cloudfront.net/dicomweb',
  });
  const imageIds2 = await createImageIdsAndCacheMetaData({
    StudyInstanceUID: '1.2.840.113663.1500.1.248223208.1.1.20110323.105903.687',
    SeriesInstanceUID:
      '1.2.840.113663.1500.1.248223208.2.1.20110323.105903.687',
    SOPInstanceUID: '1.2.840.113663.1500.1.248223208.3.10.20110323.110423.875',
    wadoRsRoot: 'https://d3t6nz73ql33tx.cloudfront.net/dicomweb',
  });

  // Instantiate a rendering engine
  const renderingEngine = new RenderingEngine(renderingEngineId);

  // Create a stack viewport
  const viewportInputs = [
    {
      viewportId,
      type: ViewportType.STACK,
      element: element1,
      defaultOptions: {
        background: <Types.Point3>[0.2, 0, 0.2],
      },
    },
    {
      viewportId: viewportId2,
      type: ViewportType.STACK,
      element: element2,
      defaultOptions: {
        background: <Types.Point3>[0.2, 0, 0.2],
      },
    },
  ];

  renderingEngine.setViewports(viewportInputs);

  // Set the tool group on the viewport
  toolGroup.addViewport(viewportId, renderingEngineId);
  toolGroup.addViewport(viewportId2, renderingEngineId);

  // Get the stack viewport that was created
  const viewport = <Types.IStackViewport>(
    renderingEngine.getViewport(viewportId)
  );

  const stack = [imageIds[0]];
  viewport.setStack(stack);

  const viewport2 = <Types.IStackViewport>(
    renderingEngine.getViewport(viewportId2)
  );

  const stack2 = [imageIds2[0]];
  viewport2.setStack(stack2);

  // // Render the image
  viewport.render();
  viewport2.render();
}

run();
