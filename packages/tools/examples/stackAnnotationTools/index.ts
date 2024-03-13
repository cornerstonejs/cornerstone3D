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
  annotationTools,
  addManipulationBindings,
} from '../../../../utils/demo/helpers';
import * as cornerstoneTools from '@cornerstonejs/tools';

// This is for debugging purposes
console.warn(
  'Click on index.ts to open source code for this example --------->'
);

const { ToolGroupManager, Enums: csToolsEnums } = cornerstoneTools;

const { ViewportType, Events } = Enums;
const { MouseBindings } = csToolsEnums;
const renderingEngineId = 'myRenderingEngine';
const viewportId = 'CT_STACK';

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

const info = document.createElement('div');
content.appendChild(info);

const instructions = document.createElement('p');
instructions.innerText = 'Left Click to use selected tool';
info.appendChild(instructions);

const rotationInfo = document.createElement('div');
info.appendChild(rotationInfo);

const flipHorizontalInfo = document.createElement('div');
info.appendChild(flipHorizontalInfo);

const flipVerticalInfo = document.createElement('div');
info.appendChild(flipVerticalInfo);

element.addEventListener(Events.CAMERA_MODIFIED, (_) => {
  // Get the rendering engine
  const renderingEngine = getRenderingEngine(renderingEngineId);

  // Get the stack viewport
  const viewport = <Types.IStackViewport>(
    renderingEngine.getViewport(viewportId)
  );

  if (!viewport) {
    return;
  }

  const { flipHorizontal, flipVertical } = viewport.getCamera();
  const { rotation } = viewport.getProperties();

  rotationInfo.innerText = `Rotation: ${Math.round(rotation)}`;
  flipHorizontalInfo.innerText = `Flip horizontal: ${flipHorizontal}`;
  flipVerticalInfo.innerText = `Flip vertical: ${flipVertical}`;
});
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

addDropdownToToolbar({
  options: { map: annotationTools },
  onSelectedValueChange: (newSelectedToolNameAsStringOrNumber) => {
    const newSelectedToolName = String(newSelectedToolNameAsStringOrNumber);
    const toolGroup = ToolGroupManager.getToolGroup(toolGroupId);

    // Set the old tool passive
    const selectedToolName = toolGroup.getActivePrimaryMouseButtonTool();
    if (selectedToolName) {
      toolGroup.setToolPassive(selectedToolName);
    }

    // Set the new tool active
    toolGroup.setToolActive(newSelectedToolName, {
      bindings: [
        {
          mouseButton: MouseBindings.Primary, // Left Click
        },
      ],
    });
  },
});

addButtonToToolbar({
  title: 'Flip H',
  onClick: () => {
    // Get the rendering engine
    const renderingEngine = getRenderingEngine(renderingEngineId);

    // Get the stack viewport
    const viewport = <Types.IStackViewport>(
      renderingEngine.getViewport(viewportId)
    );

    const { flipHorizontal } = viewport.getCamera();
    viewport.setCamera({ flipHorizontal: !flipHorizontal });

    viewport.render();
  },
});

addButtonToToolbar({
  title: 'Flip V',
  onClick: () => {
    // Get the rendering engine
    const renderingEngine = getRenderingEngine(renderingEngineId);

    // Get the stack viewport
    const viewport = <Types.IStackViewport>(
      renderingEngine.getViewport(viewportId)
    );

    const { flipVertical } = viewport.getCamera();

    viewport.setCamera({ flipVertical: !flipVertical });

    viewport.render();
  },
});

addButtonToToolbar({
  title: 'Rotate Delta 90',
  onClick: () => {
    // Get the rendering engine
    const renderingEngine = getRenderingEngine(renderingEngineId);

    // Get the stack viewport
    const viewport = <Types.IStackViewport>(
      renderingEngine.getViewport(viewportId)
    );

    const { rotation } = viewport.getProperties();
    viewport.setProperties({ rotation: rotation + 90 });

    viewport.render();
  },
});

/**
 * Runs the demo
 */
async function run() {
  // Init Cornerstone and related libraries
  await initDemo();

  // Define a tool group, which defines how mouse events map to tool commands for
  // Any viewport using the group
  const toolGroup = ToolGroupManager.createToolGroup(toolGroupId);
  addManipulationBindings(toolGroup, { toolMap: annotationTools });

  // Get Cornerstone imageIds and fetch metadata into RAM
  const imageIds = await createImageIdsAndCacheMetaData({
    StudyInstanceUID:
      '1.3.6.1.4.1.14519.5.2.1.7009.2403.334240657131972136850343327463',
    SeriesInstanceUID:
      '1.3.6.1.4.1.14519.5.2.1.7009.2403.226151125820845824875394858561',
    wadoRsRoot: 'https://d3t6nz73ql33tx.cloudfront.net/dicomweb',
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
  viewport.setStack(stack);

  // Render the image
  viewport.render();
}

run();
