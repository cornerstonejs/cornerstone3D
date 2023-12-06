import {
  RenderingEngine,
  Types,
  Enums,
  getRenderingEngine,
} from '@cornerstonejs/core';
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
  LivewireContourTool,
  PanTool,
  ZoomTool,
  ToolGroupManager,
  Enums: csToolsEnums,
} = cornerstoneTools;

const { ViewportType, Events } = Enums;
const { MouseBindings } = csToolsEnums;
const renderingEngineId = 'myRenderingEngine';
const viewportId = 'CT_STACK';

// ======== Set up page ======== //
setTitleAndDescription(
  'Livewire Contour Tool',
  'Livewire countour tool for...'
);

const content = document.getElementById('content');
const element = document.createElement('div');

// Disable right click context menu so we can have right click tools
element.oncontextmenu = (e) => e.preventDefault();

element.id = 'cornerstone-element';
element.style.width = '500px';
element.style.height = '500px';

content.appendChild(element);

const info = document.createElement('div');
content.appendChild(info);

const addInstruction = (text) => {
  const instructions = document.createElement('p');
  instructions.innerText = `- ${text}`;
  info.appendChild(instructions);
};

addInstruction('Left click to use the livewire tool');
addInstruction('Middle click to use the pan tool');
addInstruction('Right click to use the zoom tool');
addInstruction('Press "escape" to cancel drawing');

// ============================= //

const toolGroupId = 'STACK_TOOL_GROUP_ID';

const cancelToolDrawing = (evt) => {
  const { element, key } = evt.detail;
  if (key === 'Escape') {
    cornerstoneTools.cancelActiveManipulations(element);
  }
};

element.addEventListener(csToolsEnums.Events.KEY_DOWN, (evt) => {
  cancelToolDrawing(evt);
});

const toolsNames = [
  LivewireContourTool.toolName,
  PanTool.toolName,
  ZoomTool.toolName,
];
const selectedToolName = toolsNames[0];

/**
 * Runs the demo
 */
async function run() {
  // Init Cornerstone and related libraries
  await initDemo();

  // Add tools to Cornerstone3D
  cornerstoneTools.addTool(LivewireContourTool);
  cornerstoneTools.addTool(PanTool);
  cornerstoneTools.addTool(ZoomTool);

  // Define a tool group, which defines how mouse events map to tool commands for
  // Any viewport using the group
  const toolGroup = ToolGroupManager.createToolGroup(toolGroupId);

  // Add the tools to the tool group
  toolGroup.addTool(LivewireContourTool.toolName);
  toolGroup.addTool(PanTool.toolName);
  toolGroup.addTool(ZoomTool.toolName);

  // Set the initial state of the tools
  toolGroup.setToolActive(LivewireContourTool.toolName, {
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
  const imageIds = await createImageIdsAndCacheMetaData({
    // StudyInstanceUID:
    //   '1.3.6.1.4.1.14519.5.2.1.7009.2403.334240657131972136850343327463',
    // SeriesInstanceUID:
    //   '1.3.6.1.4.1.14519.5.2.1.7009.2403.226151125820845824875394858561',
    // wadoRsRoot: 'https://d3t6nz73ql33tx.cloudfront.net/dicomweb',

    // CT (512 x 512)
    // StudyInstanceUID: '1.2.840.113619.2.358.3.2644888476.772.1464857645.584',
    // SeriesInstanceUID: '1.2.840.113619.2.358.3.2644888476.772.1464857645.591.4',
    // wadoRsRoot: 'http://localhost/dicom-web',

    // MR 1 (768 x 616)
    // StudyInstanceUID: '1.2.840.1140891.0.3.8228859612298.9365998947',
    // SeriesInstanceUID: '1.2.840.1140891.0.3.3533753471029.4952997611',
    // wadoRsRoot: 'http://localhost/dicom-web',

    // MR 2 (320 x 260)
    StudyInstanceUID: '1.2.840.1140891.0.3.8228859612298.9365998947',
    SeriesInstanceUID: '1.2.840.1140891.0.3.7141694813002.87820534683',
    wadoRsRoot: 'http://localhost/dicom-web',
  });

  // Instantiate a rendering engine
  const renderingEngine = new RenderingEngine(renderingEngineId);

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

  // Define a stack containing a single image
  const stack = [imageIds[0]];

  // Set the stack on the viewport
  await viewport.setStack(stack);

  viewport.setProperties({
    interpolationType: Enums.InterpolationType.NEAREST,
  });

  // Render the image
  viewport.render();

  // ---------------------------------------------------------------------------
  const testCanvas = document.createElement('canvas');
  testCanvas.id = 'debugCanvas';
  testCanvas.width = 512;
  testCanvas.height = 512;

  Object.assign(testCanvas.style, {
    backgroundColor: '#000',
    boxSizing: 'border-box',
    position: 'absolute',
    top: '114px',
    left: '550px',
    // width: '500px',
    height: '500px',
  });

  document.body.appendChild(testCanvas);
}

run();
