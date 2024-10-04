import type { Types } from '@cornerstonejs/core';
import { RenderingEngine, Enums } from '@cornerstonejs/core';
import {
  initDemo,
  createImageIdsAndCacheMetaData,
  setTitleAndDescription,
  addDropdownToToolbar,
  addButtonToToolbar,
} from '../../../../utils/demo/helpers';
import * as cornerstoneTools from '@cornerstonejs/tools';

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
const leftClickTools = [WindowLevelTool.toolName, PlanarRotateTool.toolName];
const defaultLeftClickTool = leftClickTools[0];
let currentLeftClickTool = leftClickTools[0];

// ======== Set up page ======== //
setTitleAndDescription(
  'Ultrasounds colors',
  'Showcases how the colors of ultrasound images are displayed and rendered correctly'
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
  'Middle Click: Pan\nRight Click: Zoom\n Mouse Wheel: Stack Scroll';

content.append(instructions);
// ============================= //
let renderingEngine;
const viewportId = 'CT_STACK';

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

addButtonToToolbar({
  onClick: () => {
    const viewport = renderingEngine.getViewport(viewportId);
    viewport.scroll(1);
  },
  title: 'Scroll',
});
/**1
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
  // As the Stack Scroll mouse wheel is a tool using the `mouseWheelCallback`
  // hook instead of mouse buttons, it does not need to assign any mouse button.
  toolGroup.setToolActive(StackScrollTool.toolName, {
    bindings: [{ mouseButton: MouseBindings.Wheel }],
  });

  // Get Cornerstone imageIds and fetch metadata into RAM
  const imageIds1 = await createImageIdsAndCacheMetaData({
    StudyInstanceUID:
      '1.3.6.1.4.1.14519.5.2.1.1188.2803.137585363493444318569098508293',
    SeriesInstanceUID:
      '1.3.6.1.4.1.14519.5.2.1.1188.2803.699272945123913604672897602509',
    SOPInstanceUID:
      '1.3.6.1.4.1.14519.5.2.1.1188.2803.260509337872681089220763036630',
    wadoRsRoot: 'https://d33do7qe4w26qo.cloudfront.net/dicomweb',
  });

  const imageIds2 = await createImageIdsAndCacheMetaData({
    StudyInstanceUID:
      '1.3.6.1.4.1.14519.5.2.1.1188.2803.137585363493444318569098508293',
    SeriesInstanceUID:
      '1.3.6.1.4.1.14519.5.2.1.1188.2803.699272945123913604672897602509',
    SOPInstanceUID:
      '1.3.6.1.4.1.14519.5.2.1.1188.2803.483828432025129950375795590895',
    wadoRsRoot: 'https://d33do7qe4w26qo.cloudfront.net/dicomweb',
  });

  const imageIds3 = await createImageIdsAndCacheMetaData({
    StudyInstanceUID:
      '1.3.6.1.4.1.14519.5.2.1.1188.2803.137585363493444318569098508293',
    SeriesInstanceUID:
      '1.3.6.1.4.1.14519.5.2.1.1188.2803.699272945123913604672897602509',
    SOPInstanceUID:
      '1.3.6.1.4.1.14519.5.2.1.1188.2803.258716376345918859336299957175',
    wadoRsRoot: 'https://d33do7qe4w26qo.cloudfront.net/dicomweb',
  });

  const imageIds4 = await createImageIdsAndCacheMetaData({
    StudyInstanceUID:
      '1.3.6.1.4.1.14519.5.2.1.1188.2803.137585363493444318569098508293',
    SeriesInstanceUID:
      '1.3.6.1.4.1.14519.5.2.1.1188.2803.699272945123913604672897602509',
    SOPInstanceUID:
      '1.3.6.1.4.1.14519.5.2.1.1188.2803.391530379841424362796442074081',
    wadoRsRoot: 'https://d33do7qe4w26qo.cloudfront.net/dicomweb',
  });

  const imageIds5 = await createImageIdsAndCacheMetaData({
    StudyInstanceUID: '1.2.840.113663.1500.1.248223208.1.1.20110323.105903.687',
    SeriesInstanceUID:
      '1.2.840.113663.1500.1.248223208.2.1.20110323.105903.687',
    SOPInstanceUID: '1.2.840.113663.1500.1.248223208.3.1.20110323.110042.375',
    wadoRsRoot: 'https://d33do7qe4w26qo.cloudfront.net/dicomweb',
  });

  const imageIds6 = await createImageIdsAndCacheMetaData({
    StudyInstanceUID: '1.2.840.113663.1500.1.248223208.1.1.20110323.105903.687',
    SeriesInstanceUID:
      '1.2.840.113663.1500.1.248223208.2.1.20110323.105903.687',
    SOPInstanceUID: '1.2.840.113663.1500.1.248223208.3.4.20110323.110138.828',
    wadoRsRoot: 'https://d33do7qe4w26qo.cloudfront.net/dicomweb',
  });

  const imageIds7 = await createImageIdsAndCacheMetaData({
    StudyInstanceUID: '1.2.840.113663.1500.1.248223208.1.1.20110323.105903.687',
    SeriesInstanceUID:
      '1.2.840.113663.1500.1.248223208.2.1.20110323.105903.687',
    SOPInstanceUID: '1.2.840.113663.1500.1.248223208.3.11.20110323.110511.281',
    wadoRsRoot: 'https://d33do7qe4w26qo.cloudfront.net/dicomweb',
  });

  // const imageIds = [usSeries1[10]];
  const imageIds = [
    imageIds1[0],
    imageIds2[0],
    imageIds3[0],
    imageIds4[0],
    imageIds5[0],
    imageIds6[0],
    imageIds7[0],
  ];

  // Instantiate a rendering engine
  const renderingEngineId = 'myRenderingEngine';
  renderingEngine = new RenderingEngine(renderingEngineId);

  // Create a stack viewport

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
