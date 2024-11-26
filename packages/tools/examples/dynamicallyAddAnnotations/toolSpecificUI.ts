import {
  getEnabledElementByViewportId,
  getRenderingEngine,
  utilities,
} from '@cornerstonejs/core';
import type { Point3 } from '@cornerstonejs/core/types/Point3';
import type { Point2 } from '@cornerstonejs/core/types';
import { LengthTool, ProbeTool } from '@cornerstonejs/tools';

interface ToolUIConfig {
  toolName: string;
  renderingEngineId: string;
  content: HTMLElement;
  demoToolbar: HTMLElement;
}

interface ToolUI {
  forms: HTMLElement[];
}

export const STACK_VIEWPORT_ID = 'viewport-stack';
export const VOLUME_VIEWPORT_ID = 'viewport-volume';

const typeToIdMap = {
  stack: STACK_VIEWPORT_ID,
  volume: VOLUME_VIEWPORT_ID,
};

const typeToStartIdMap = {
  canvas: 'canvas-start',
  image: 'image-start',
};

const typeToEndIdMap = {
  canvas: 'canvas-end',
  image: 'image-end',
};

function getViewport(viewportType: string) {
  const enabledElement = getEnabledElementByViewportId(
    typeToIdMap[viewportType]
  );
  return enabledElement.viewport;
}

/**
 * Creates and returns the UI elements for the Length tool
 */
function createLengthToolUI(config: ToolUIConfig): ToolUI {
  // Add input elements for Image Coords
  const canvasCoordsForm = document.createElement('form');
  canvasCoordsForm.style.marginTop = '20px';
  canvasCoordsForm.style.marginBottom = '10px';
  canvasCoordsForm.innerHTML = `
  <label style="margin-right: 20px;">Canvas Coords: Start [x, y]:</label>
  <input  style="width:40px " type="number" id="canvas-start-1" placeholder="Start x" value="10">
  <input  style="width:40px" type="number" id="canvas-start-2" placeholder="Start y" value="10">
  <label style="margin-left: 52px; margin-right: 21px;">End [x, y]:</label>
  <input  style="width:40px" type="number" id="canvas-end-1" placeholder="End i" value="100">
  <input  style="width:40px" type="number" id="canvas-end-2" placeholder="End j" value="100">
  <button  style="  margin-left: 52px;" type="button" id="canvas-stack">Add Stack</button>
  <button   type="button" id="canvas-volume">Add Volume</button>
`;
  const imageCoordsForm = document.createElement('form');
  imageCoordsForm.style.marginBottom = '10px';
  imageCoordsForm.innerHTML = `
  <label style="margin-right: 20px;">Image Coords: Start [i, j]:</label>
  <input  style="width:40px " type="number" id="image-start-1" placeholder="Start i" value="10">
  <input  style="width:40px" type="number" id="image-start-2" placeholder="Start j" value="10">
  <label style="margin-left: 52px; margin-right: 21px;">End [i, j]:</label>
  <input  style="width:40px" type="number" id="image-end-1" placeholder="End i" value="100">
  <input  style="width:40px" type="number" id="image-end-2" placeholder="End j" value="100">
  <button  style="  margin-left: 52px;" type="button" id="image-stack">Add Stack</button>
  <button   type="button" id="image-volume">Add Volume</button>
`;

  // add event listeners to all buttons
  const buttons = [
    canvasCoordsForm.querySelector('#canvas-stack'),
    canvasCoordsForm.querySelector('#canvas-volume'),
    imageCoordsForm.querySelector('#image-stack'),
    imageCoordsForm.querySelector('#image-volume'),
  ];

  buttons.forEach((button) => {
    button.addEventListener('click', () => {
      // which target was clicked?
      const type = button.id.split('-')[0];
      const viewportType = button.id.split('-')[1];

      const viewport = getViewport(viewportType);

      // get the start and end points from the form
      let worldStart: Point3;
      let worldEnd: Point3;

      if (type === 'image') {
        const start = [
          Number(
            imageCoordsForm.querySelector(`#${typeToStartIdMap.image}-1`).value
          ),
          Number(
            imageCoordsForm.querySelector(`#${typeToStartIdMap.image}-2`).value
          ),
        ];
        const end = [
          Number(
            imageCoordsForm.querySelector(`#${typeToEndIdMap.image}-1`).value
          ),
          Number(
            imageCoordsForm.querySelector(`#${typeToEndIdMap.image}-2`).value
          ),
        ];

        worldStart = utilities.imageToWorldCoords(
          viewport.getCurrentImageId(),
          [...start]
        );
        worldEnd = utilities.imageToWorldCoords(viewport.getCurrentImageId(), [
          ...end,
        ]);
      } else if (type === 'canvas') {
        const start = [
          Number(
            canvasCoordsForm.querySelector(`#${typeToStartIdMap.canvas}-1`)
              .value
          ),
          Number(
            canvasCoordsForm.querySelector(`#${typeToStartIdMap.canvas}-2`)
              .value
          ),
        ];
        const end = [
          Number(
            canvasCoordsForm.querySelector(`#${typeToEndIdMap.canvas}-1`).value
          ),
          Number(
            canvasCoordsForm.querySelector(`#${typeToEndIdMap.canvas}-2`).value
          ),
        ];

        worldStart = viewport.canvasToWorld(start);
        worldEnd = viewport.canvasToWorld(end);
      }

      LengthTool.hydrate(viewport.id, [worldStart, worldEnd]);
    });
  });

  return {
    forms: [canvasCoordsForm, imageCoordsForm],
    // cleanup,
  };
}

/**
 * Creates and returns the UI elements for the Probe tool
 */
function createProbeToolUI(config: ToolUIConfig): ToolUI {
  // Add input elements for Canvas Coords
  const canvasCoordsForm = document.createElement('form');
  canvasCoordsForm.style.marginBottom = '10px';
  canvasCoordsForm.innerHTML = `
  <label style="margin-right: 20px;">Canvas Coords: Point [x, y]:</label>
  <input style="width:40px" type="number" id="canvas-start-1" placeholder="x" value="10">
  <input style="width:40px" type="number" id="canvas-start-2" placeholder="y" value="10">
  <button style="margin-left: 52px;" type="button" id="canvas-stack">Add Stack</button>
  <button type="button" id="canvas-volume">Add Volume</button>
`;

  // Add input elements for Image Coords
  const imageCoordsForm = document.createElement('form');
  imageCoordsForm.style.marginBottom = '10px';
  imageCoordsForm.innerHTML = `
  <label style="margin-right: 20px;">Image Coords: Point [i, j]:</label>
  <input style="width:40px" type="number" id="image-start-1" placeholder="i" value="10">
  <input style="width:40px" type="number" id="image-start-2" placeholder="j" value="10">
  <button style="margin-left: 52px;" type="button" id="image-stack">Add Stack</button>
  <button type="button" id="image-volume">Add Volume</button>
`;

  // add event listeners to all buttons
  const buttons = [
    canvasCoordsForm.querySelector('#canvas-stack'),
    canvasCoordsForm.querySelector('#canvas-volume'),
    imageCoordsForm.querySelector('#image-stack'),
    imageCoordsForm.querySelector('#image-volume'),
  ];

  buttons.forEach((button) => {
    button.addEventListener('click', () => {
      // which target was clicked?
      const type = button.id.split('-')[0];
      const viewportType = button.id.split('-')[1];

      const viewport = getViewport(viewportType);

      // get the start and end points from the form
      let worldStart: Point3;
      let worldEnd: Point3;

      if (type === 'image') {
        const start = [
          Number(
            imageCoordsForm.querySelector(`#${typeToStartIdMap.image}-1`).value
          ),
          Number(
            imageCoordsForm.querySelector(`#${typeToStartIdMap.image}-2`).value
          ),
        ];

        worldStart = utilities.imageToWorldCoords(
          viewport.getCurrentImageId(),
          [...start]
        );
      } else if (type === 'canvas') {
        const start = [
          Number(
            canvasCoordsForm.querySelector(`#${typeToStartIdMap.canvas}-1`)
              .value
          ),
          Number(
            canvasCoordsForm.querySelector(`#${typeToStartIdMap.canvas}-2`)
              .value
          ),
        ];

        worldStart = viewport.canvasToWorld(start);
      }

      ProbeTool.hydrate(viewport.id, [worldStart]);
    });
  });

  return {
    forms: [canvasCoordsForm, imageCoordsForm],
  };
}

const toolUIRegistry = {
  Length: createLengthToolUI,
  Probe: createProbeToolUI,
};

export function createToolUI(
  toolName: string,
  config: ToolUIConfig
): ToolUI | null {
  const creator = toolUIRegistry[toolName];
  if (!creator) {
    console.debug('No UI configuration for tool:', toolName);
    return null;
  }
  return creator(config);
}
