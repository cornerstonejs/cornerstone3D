import type { Types } from '@cornerstonejs/core';
import { cache, RenderingEngine, Enums } from '@cornerstonejs/core';
import {
  initDemo,
  createImageIdsAndCacheMetaData,
  setTitleAndDescription,
  addButtonToToolbar,
} from '../../../../utils/demo/helpers';
import * as cornerstoneTools from '@cornerstonejs/tools';
import WindowLevelTool from '../../src/tools/WindowLevelTool';

console.warn(
  'Click on index.ts to open source code for this example --------->'
);

const {
  StackScrollTool,
  ZoomTool,
  UltrasoundAnnotationTool,
  ToolGroupManager,
  Enums: csToolsEnums,
} = cornerstoneTools;

const { ViewportType } = Enums;
const { MouseBindings } = csToolsEnums;

const toolGroupId = 'STACK_TOOL_GROUP_ID';
const leftClickTools = [UltrasoundAnnotationTool.toolName];
const defaultLeftClickTool = leftClickTools[0];
let usAnnotation = undefined;

// ======== Set up page ======== //
setTitleAndDescription(
  'Ultrasound annotations',
  'Showcases how the bline and pleura annotations of ultrasound images are displayed and rendered correctly'
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
  'Middle Click: Window Level\nRight Click: Zoom\n Mouse Wheel: Stack Scroll';

content.append(instructions);
// ============================= //
let renderingEngine;
const viewportId = 'US_STACK';

addButtonToToolbar({
  onClick: () => {
    const viewport = renderingEngine.getViewport(viewportId);
    viewport.scroll(1);
  },
  title: 'Scroll',
});

addButtonToToolbar({
  onClick: () => {
    usAnnotation.setActiveAnnotationType(
      UltrasoundAnnotationTool.USAnnotationType.BLINE
    );
  },
  title: 'Add B-Line annotation',
});

addButtonToToolbar({
  onClick: () => {
    usAnnotation.setActiveAnnotationType(
      UltrasoundAnnotationTool.USAnnotationType.PLEURA
    );
  },
  title: 'Add Pleura annotation',
});

addButtonToToolbar({
  onClick: () => {
    usAnnotation.deleteLastAnnotationType(
      UltrasoundAnnotationTool.USAnnotationType.PLEURA
    );

    // Get the stack viewport that was created
    const viewport = <Types.IStackViewport>(
      renderingEngine.getViewport(viewportId)
    );
    viewport.render();
  },
  title: 'Delete last Pleura annotation',
});

addButtonToToolbar({
  onClick: () => {
    usAnnotation.deleteLastAnnotationType(
      UltrasoundAnnotationTool.USAnnotationType.BLINE
    );

    // Get the stack viewport that was created
    const viewport = <Types.IStackViewport>(
      renderingEngine.getViewport(viewportId)
    );
    viewport.render();
  },
  title: 'Delete last B-line annotation',
});

/**1
 * Runs the demo
 */
async function run() {
  // Init Cornerstone and related libraries
  await initDemo();

  // Add tools to Cornerstone3D
  cornerstoneTools.addTool(StackScrollTool);
  cornerstoneTools.addTool(ZoomTool);
  cornerstoneTools.addTool(UltrasoundAnnotationTool);
  cornerstoneTools.addTool(WindowLevelTool);

  // Define a tool group, which defines how mouse events map to tool commands for
  // Any viewport using the group
  const toolGroup = ToolGroupManager.createToolGroup(toolGroupId);

  // Add tools to the tool group
  toolGroup.addTool(WindowLevelTool.toolName);
  toolGroup.addTool(ZoomTool.toolName);
  toolGroup.addTool(StackScrollTool.toolName, { loop: false });
  toolGroup.addTool(UltrasoundAnnotationTool.toolName);

  // Set the initial state of the tools, here all tools are active and bound to
  // Different mouse inputs
  toolGroup.setToolActive(defaultLeftClickTool, {
    bindings: [
      {
        mouseButton: MouseBindings.Primary, // Left Click
      },
    ],
  });
  toolGroup.setToolActive(WindowLevelTool.toolName, {
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
  const imageIds = await createImageIdsAndCacheMetaData({
    StudyInstanceUID:
      '1.3.6.1.4.1.14519.5.2.1.1188.2803.137585363493444318569098508293',
    SeriesInstanceUID:
      '1.3.6.1.4.1.14519.5.2.1.1188.2803.699272945123913604672897602509',
    SOPInstanceUID:
      '1.3.6.1.4.1.14519.5.2.1.1188.2803.260509337872681089220763036630',
    wadoRsRoot: 'https://d14fa38qiwhyfd.cloudfront.net/dicomweb',
  });

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
  usAnnotation = toolGroup.getToolInstance(UltrasoundAnnotationTool.toolName);

  cornerstoneTools.utilities.stackPrefetch.enable(viewport.element);

  // Render the image
  viewport.render();
}

run();
