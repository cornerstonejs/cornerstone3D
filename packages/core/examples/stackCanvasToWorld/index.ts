import { RenderingEngine, Types, Enums, utilities } from '@cornerstonejs/core';
import {
  initDemo,
  createImageIdsAndCacheMetaData,
  setTitleAndDescription,
  ctVoiRange,
} from '../../../../utils/demo/helpers';

// This is for debugging purposes
console.warn(
  'Click on index.ts to open source code for this example --------->'
);

const { ViewportType } = Enums;
const { worldToImageCoords } = utilities;

// ======== Set up page ======== //
setTitleAndDescription(
  'Stack CanvasToWorld',
  'Displays the world and image (ijk) coordinates when the mouse is moved over the canvas.'
);

const content = document.getElementById('content');
const element = document.createElement('div');
element.id = 'cornerstone-element';
element.style.width = '500px';
element.style.height = '500px';

content.appendChild(element);

const mousePosDiv = document.createElement('div');

const canvasPosElement = document.createElement('p');
const worldPosElement = document.createElement('p');
const imagePosElement = document.createElement('p');

canvasPosElement.innerText = 'canvas:';
worldPosElement.innerText = 'world:';
imagePosElement.innerText = 'image (ijk):';

content.appendChild(mousePosDiv);

mousePosDiv.appendChild(canvasPosElement);
mousePosDiv.appendChild(worldPosElement);
mousePosDiv.appendChild(imagePosElement);

// ============================= //

/**
 * Runs the demo
 */
async function run() {
  // Init Cornerstone and related libraries
  await initDemo();

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

  // Get the stack viewport that was created
  const viewport = <Types.IStackViewport>(
    renderingEngine.getViewport(viewportId)
  );

  // Define a stack containing a single image
  const stack = [imageIds[0]];

  // Set the stack on the viewport
  await viewport.setStack(stack);

  // Set the VOI of the stack
  viewport.setProperties({ voiRange: ctVoiRange });

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
    // Convert world coordinates to image (ijk) coordinates
    const imagePos = worldToImageCoords(viewport.getCurrentImageId(), worldPos);

    canvasPosElement.innerText = `canvas: (${canvasPos[0]}, ${canvasPos[1]})`;
    worldPosElement.innerText = `world: (${worldPos[0].toFixed(
      2
    )}, ${worldPos[1].toFixed(2)}, ${worldPos[2].toFixed(2)})`;
    imagePosElement.innerText = `image (ijk): (${imagePos[0].toFixed(
      2
    )}, ${imagePos[1].toFixed(2)}, ${imagePos[2].toFixed(2)})`;
  });
}

run();
