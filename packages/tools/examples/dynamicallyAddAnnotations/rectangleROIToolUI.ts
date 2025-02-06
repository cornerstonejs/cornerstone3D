import { getEnabledElementByViewportId, utilities } from '@cornerstonejs/core';
import type { Point2 } from '@cornerstonejs/core/types';
import type { Point3 } from '@cornerstonejs/core/types/Point3';
import { RectangleROITool } from '@cornerstonejs/tools';
import { typeToIdMap } from './constants';

function getInputValue(form: HTMLFormElement, inputId: string): number {
  return Number((form.querySelector(`#${inputId}`) as HTMLInputElement).value);
}

function getCoordinates(
  form: HTMLFormElement,
  type: 'canvas' | 'image'
): {
  topLeft: Point2;
  topRight: Point2;
  bottomLeft: Point2;
  bottomRight: Point2;
} {
  return {
    topLeft: [
      getInputValue(form, `${type}-start-1`),
      getInputValue(form, `${type}-start-2`),
    ],
    topRight: [
      getInputValue(form, `${type}-topright-1`),
      getInputValue(form, `${type}-topright-2`),
    ],
    bottomLeft: [
      getInputValue(form, `${type}-bottomleft-1`),
      getInputValue(form, `${type}-bottomleft-2`),
    ],
    bottomRight: [
      getInputValue(form, `${type}-bottomright-1`),
      getInputValue(form, `${type}-bottomright-2`),
    ],
  };
}

function createFormElement(): HTMLFormElement {
  const form = document.createElement('form');
  form.style.marginBottom = '10px';

  ['canvas', 'image'].forEach((coordType) => {
    form.innerHTML += `
      <label style="margin-right: 20px;">${
        coordType.charAt(0).toUpperCase() + coordType.slice(1)
      } Coords: Top Left [${coordType === 'canvas' ? 'x, y' : 'i, j'}]:</label>
      <input style="width:40px" type="number" id="${coordType}-start-1" placeholder="${
      coordType === 'canvas' ? 'x' : 'i'
    }" value="10">
      <input style="width:40px" type="number" id="${coordType}-start-2" placeholder="${
      coordType === 'canvas' ? 'y' : 'j'
    }" value="10">
      <label style="margin-left: 52px; margin-right: 21px;">Top Right [${
        coordType === 'canvas' ? 'x, y' : 'i, j'
      }]:</label>
      <input style="width:40px" type="number" id="${coordType}-topright-1" value="110">
      <input style="width:40px" type="number" id="${coordType}-topright-2" value="10">
      <br>
      <label style="margin-right: 20px;">Bottom Left [${
        coordType === 'canvas' ? 'x, y' : 'i, j'
      }]:</label>
      <input style="width:40px" type="number" id="${coordType}-bottomleft-1" value="10">
      <input style="width:40px" type="number" id="${coordType}-bottomleft-2" value="110">
      <label style="margin-left: 52px; margin-right: 21px;">Bottom Right [${
        coordType === 'canvas' ? 'x, y' : 'i, j'
      }]:</label>
      <input style="width:40px" type="number" id="${coordType}-bottomright-1" value="110">
      <input style="width:40px" type="number" id="${coordType}-bottomright-2" value="110">
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

      const convertPoint = (point: Point2): Point3 =>
        type === 'image'
          ? (utilities.imageToWorldCoords(
              imageId || currentImageId,
              point
            ) as Point3)
          : viewport.canvasToWorld(point);

      const points: Point3[] = [
        convertPoint(coords.bottomLeft),
        convertPoint(coords.bottomRight),
        convertPoint(coords.topLeft),
        convertPoint(coords.topRight),
      ];

      RectangleROITool.hydrate(viewport.id, points);
    });
  });
}

export function createRectangleROIToolUI(): HTMLFormElement {
  const form = createFormElement();
  addButtonListeners(form);
  return form;
}
