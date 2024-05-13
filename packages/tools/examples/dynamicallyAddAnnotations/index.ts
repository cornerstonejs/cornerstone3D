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
} from '../../../../utils/demo/helpers';
import * as cornerstoneTools from '@cornerstonejs/tools';

// This is for debugging purposes
console.warn(
  'Click on index.ts to open source code for this example --------->'
);

const { ViewportType, Events } = Enums;
const renderingEngineId = 'myRenderingEngine';
const viewportId = 'CT_STACK';
const toolGroupId = 'STACK_TOOL_GROUP_ID';

// ======== Set up page ======== //
setTitleAndDescription(
  'Dynamically Add Annotations',
  'Enter the image coords or world coords and press Enter to add an annotation.'
);

const content = document.getElementById('content');
const demoToolbar = document.getElementById('demo-toolbar');

const element = document.createElement('div');

// Disable right click context menu so we can have right click tools
element.oncontextmenu = (e) => e.preventDefault();

element.id = 'cornerstone-element';
element.style.width = '500px';
element.style.height = '500px';

// Add input elements for Image Coords
const imageCoordsForm = document.createElement('form');
imageCoordsForm.style.marginBottom = '10px';
imageCoordsForm.innerHTML = `
  <label style="margin-right: 20px;">Image Coords: Start [i, j]:</label>
  <input  style="width:40px " type="number" id="start-i" placeholder="Start i" value="0">
  <input  style="width:40px" type="number" id="start-j" placeholder="Start j" value="0">
  <label style="margin-left: 52px; margin-right: 21px;">End [i, j]:</label>
  <input  style="width:40px" type="number" id="end-i" placeholder="End i" value="0">
  <input  style="width:40px" type="number" id="end-j" placeholder="End j" value="0">
  <button  style="width:40px;  margin-left: 52px;" type="button" id="add-image-coords">Add</button>
`;

// Add input elements for World Coords
const worldCoordsForm = document.createElement('form');
worldCoordsForm.style.marginBottom = '10px';
worldCoordsForm.innerHTML = `
  <label>World Coords: Start [x, y, z]:</label>
  <input  style="width:40px" type="number" id="start-x" placeholder="Start x" value="0">
  <input  style="width:40px" type="number" id="start-y" placeholder="Start y" value="0">
  <input  style="width:40px" type="number" id="start-z" placeholder="Start z" value="0">
  <label>End [x, y, z]:</label>
  <input  style="width:40px" type="number" id="end-x" placeholder="End x" value="0">
  <input  style="width:40px" type="number" id="end-y" placeholder="End y" value="0">
  <input  style="width:40px" type="number" id="end-z" placeholder="End z" value="0">
  <button type="button" id="add-world-coords">Add</button>
`;

const mousePosDiv = document.createElement('div');

const canvasPosElement = document.createElement('p');
const worldPosElement = document.createElement('p');

canvasPosElement.innerText = 'canvas:';
worldPosElement.innerText = 'world:';

mousePosDiv.appendChild(canvasPosElement);
mousePosDiv.appendChild(worldPosElement);

content.appendChild(element);
content.appendChild(mousePosDiv);
demoToolbar.appendChild(imageCoordsForm);
demoToolbar.appendChild(worldCoordsForm);

// Event listeners for the buttons
document.getElementById('add-image-coords').addEventListener('click', () => {
  const start = [
    parseFloat((document.getElementById('start-i') as HTMLInputElement).value),
    parseFloat((document.getElementById('start-j') as HTMLInputElement).value),
  ];
  const end = [
    parseFloat((document.getElementById('end-i') as HTMLInputElement).value),
    parseFloat((document.getElementById('end-j') as HTMLInputElement).value),
  ];

  addProgrammaticAnnotation(start, end, 'image');
});

document.getElementById('add-world-coords').addEventListener('click', () => {
  const start = [
    parseFloat((document.getElementById('start-x') as HTMLInputElement).value),
    parseFloat((document.getElementById('start-y') as HTMLInputElement).value),
    parseFloat((document.getElementById('start-z') as HTMLInputElement).value),
  ];
  const end = [
    parseFloat((document.getElementById('end-x') as HTMLInputElement).value),
    parseFloat((document.getElementById('end-y') as HTMLInputElement).value),
    parseFloat((document.getElementById('end-z') as HTMLInputElement).value),
  ];

  addProgrammaticAnnotation(start, end);
});

const addProgrammaticAnnotation = (
  start: number[],
  end: number[],
  type?: string
) => {
  const renderingEngine = getRenderingEngine(renderingEngineId);
  const viewport = <Types.IStackViewport>(
    renderingEngine.getViewport(viewportId)
  );
  if (type === 'image') {
    // convert image coords to world coords
    start = viewport.canvasToWorld(<Types.Point2>[...start]);
    end = viewport.canvasToWorld(<Types.Point2>[...end]);
  }
  const referencedImageId = viewport.getCurrentImageId();
  const FrameOfReferenceUID = viewport.getFrameOfReferenceUID();
  const {
    viewUp,
    position: cameraPosition,
    viewPlaneNormal,
    focalPoint: cameraFocalPoint,
  } = viewport.getCamera();

  const annotation = {
    highlighted: true,
    invalidated: false,
    metadata: {
      toolName: 'Length',
      referencedImageId,
      viewUp,
      cameraPosition,
      FrameOfReferenceUID,
      viewPlaneNormal,
      cameraFocalPoint,
    },
    data: {
      handles: {
        points: [<Types.Point3>[...start], <Types.Point3>[...end]],
        activeHandleIndex: null,
        textBox: {
          hasMoved: false,
          worldPosition: <Types.Point3>[0, 0, 0],
          worldBoundingBox: {
            topLeft: <Types.Point3>[0, 0, 0],
            topRight: <Types.Point3>[0, 0, 0],
            bottomLeft: <Types.Point3>[0, 0, 0],
            bottomRight: <Types.Point3>[0, 0, 0],
          },
        },
      },
      label: '',
      cachedStats: {},
    },
    isLocked: true,
    isVisible: true,
  };

  cornerstoneTools.annotation.state.addAnnotation(annotation, viewport.element);
  cornerstoneTools.utilities.triggerAnnotationRenderForViewportIds(
    renderingEngine,
    [viewport.id]
  );
  viewport.render();
};
// ============================= //

/**
 * Runs the demo
 */
async function run() {
  // Init Cornerstone and related libraries
  await initDemo();

  cornerstoneTools.addTool(cornerstoneTools.LengthTool);
  const toolGroup =
    cornerstoneTools.ToolGroupManager.createToolGroup(toolGroupId);
  toolGroup.addTool(cornerstoneTools.LengthTool.toolName);

  toolGroup.setToolActive(cornerstoneTools.LengthTool.toolName);
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

  // Get the stack viewport that was created
  const viewport = <Types.IStackViewport>(
    renderingEngine.getViewport(viewportId)
  );

  // Define a stack containing a single image
  const stack = [imageIds[0]];
  toolGroup.addViewport(viewportId, renderingEngineId);

  // Set the stack on the viewport
  viewport.setStack(stack);

  // Render the image
  viewport.render();

  element.addEventListener('mousemove', (evt) => {
    const rect = element.getBoundingClientRect();

    const canvasPos: Types.Point2 = [
      Math.floor(evt.clientX - rect.left),
      Math.floor(evt.clientY - rect.top),
    ];
    // Convert canvas coordinates to world coordinates
    const worldPos = viewport.canvasToWorld(canvasPos);

    canvasPosElement.innerText = `canvas: (${canvasPos[0]}, ${canvasPos[1]})`;
    worldPosElement.innerText = `world: (${worldPos[0].toFixed(
      2
    )}, ${worldPos[1].toFixed(2)}, ${worldPos[2].toFixed(2)})`;
  });
}

run();
