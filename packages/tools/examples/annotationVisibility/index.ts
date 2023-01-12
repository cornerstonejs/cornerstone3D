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
  addButtonToToolbar,
} from '../../../../utils/demo/helpers';
import {
  LengthTool,
  RectangleROITool,
  ToolGroupManager,
  Enums as csToolsEnums,
  annotation,
  addTool,
} from '@cornerstonejs/tools';

// This is for debugging purposes
console.warn(
  'Click on index.ts to open source code for this example --------->'
);

const { MouseBindings } = csToolsEnums;

const { selection, visibility } = annotation;
const { ViewportType } = Enums;
const viewportId = 'CT_STACK';

// ======== Set up page ======== //
setTitleAndDescription(
  'Annotation Visibility',
  'Here we demonstrate the changing visibility of annotations'
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
instructions.innerText = `
  - Drawn annotations with the left mouse button.
  - Clicking "Hide Selected Annotation" will hide the selected annotation, preventing it from being used at all.
  - Clicking "Show all Annotations" will show all annotations (previously hidden).
`;

content.append(instructions);
// ============================= //

const renderingEngineId = 'myRenderingEngine';
const toolGroupId = 'STACK_TOOL_GROUP_ID';

addButtonToToolbar({
  title: 'Hide Selected Annotations',
  onClick: () => {
    const annotationUIDs = selection.getAnnotationsSelected();

    if (annotationUIDs && annotationUIDs.length) {
      const annotationUID = annotationUIDs[0];

      visibility.setAnnotationVisibility(annotationUID, false);

      // Render the image to see it was hidden
      const renderingEngine = getRenderingEngine(renderingEngineId);
      renderingEngine.renderViewports([viewportId]);
    }
  },
});

addButtonToToolbar({
  title: 'Show all Annotation',
  onClick: () => {
    visibility.showAllAnnotations();
    const renderingEngine = getRenderingEngine(renderingEngineId);
    renderingEngine.renderViewports([viewportId]);
  },
});

/**
 * Runs the demo
 */
async function run() {
  // Init Cornerstone and related libraries
  await initDemo();

  // Add tools to Cornerstone3D
  addTool(LengthTool);
  addTool(RectangleROITool);

  // Define a tool group, which defines how mouse events map to tool commands for
  // Any viewport using the group
  const toolGroup = ToolGroupManager.createToolGroup(toolGroupId);

  // Add the tools to the tool group
  toolGroup.addTool(LengthTool.toolName);
  toolGroup.addTool(RectangleROITool.toolName);

  // Set both tools passive to we can edit annotations
  toolGroup.setToolActive(LengthTool.toolName, {
    bindings: [
      {
        mouseButton: MouseBindings.Primary, // Left Click
      },
    ],
  });
  toolGroup.setToolPassive(RectangleROITool.toolName);

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
