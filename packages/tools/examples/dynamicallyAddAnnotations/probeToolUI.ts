import {
  getEnabledElementByViewportId,
  getRenderingEngine,
  utilities,
} from '@cornerstonejs/core';
import type { Point2 } from '@cornerstonejs/core/types';
import type { Point3 } from '@cornerstonejs/core/types/Point3';
import { ProbeTool } from '@cornerstonejs/tools';
import { typeToIdMap, typeToStartIdMap } from './constants';

function getInputValue(form: HTMLFormElement, inputId: string): number {
  return Number((form.querySelector(`#${inputId}`) as HTMLInputElement).value);
}

function getCoordinates(
  form: HTMLFormElement,
  type: 'canvas' | 'image'
): { topLeft: Point2 } {
  const topLeft: Point2 = [
    getInputValue(form, `${typeToStartIdMap[type]}-1`),
    getInputValue(form, `${typeToStartIdMap[type]}-2`),
  ];

  return { topLeft };
}

function createFormElement(): HTMLFormElement {
  const form = document.createElement('form');
  form.style.marginBottom = '10px';

  ['canvas', 'image'].forEach((coordType) => {
    form.innerHTML += `
      <label style="margin-right: 20px;">${
        coordType.charAt(0).toUpperCase() + coordType.slice(1)
      } Coords: Point [${coordType === 'canvas' ? 'x, y' : 'i, j'}]:</label>
      <input style="width:40px" type="number" id="${coordType}-start-1" placeholder="${
      coordType === 'canvas' ? 'x' : 'i'
    }" value="10">
      <input style="width:40px" type="number" id="${coordType}-start-2" placeholder="${
      coordType === 'canvas' ? 'y' : 'j'
    }" value="10">
      <br>
      <button style="margin-left: 52px;" type="button" id="${coordType}-stack">Add Stack</button>
      <button type="button" id="${coordType}-volume">Add Volume</button>
      ${
        coordType === 'image'
          ? `<button type="button" id="${coordType}-volume-imageId">Add to specific image in volume (first imageId/inferior-most image in volume)</button> `
          : ''
      }
      <br><br>
    `;
  });

  return form;
}

function addButtonListeners(form: HTMLFormElement): void {
  const buttons = form.querySelectorAll('button');
  buttons.forEach((button) => {
    button.addEventListener('click', () => {
      const [type, viewportType, useImageId] = button.id.split('-') as [
        'canvas' | 'image',
        keyof typeof typeToIdMap,
        'imageId'?
      ];
      const enabledElement = getEnabledElementByViewportId(
        typeToIdMap[viewportType]
      );
      const viewport = enabledElement.viewport;
      const imageId = useImageId && viewport.getImageIds()[0];
      const coords = getCoordinates(form, type);
      const currentImageId = viewport.getCurrentImageId() as string;

      const worldStart =
        type === 'image'
          ? utilities.imageToWorldCoords(
              imageId || currentImageId,
              coords.topLeft
            )
          : viewport.canvasToWorld(coords.topLeft);

      ProbeTool.hydrate(viewport.id, [worldStart]);
    });
  });
}

export function createProbeToolUI(): HTMLFormElement {
  const form = createFormElement();
  addButtonListeners(form);
  return form;
}
