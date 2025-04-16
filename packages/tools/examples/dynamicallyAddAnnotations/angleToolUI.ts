import { getEnabledElementByViewportId, utilities } from '@cornerstonejs/core';
import type { Point2 } from '@cornerstonejs/core/types';
import { AngleTool } from '@cornerstonejs/tools';
import { typeToIdMap, typeToStartIdMap, typeToEndIdMap } from './constants';

function getInputValue(form: HTMLFormElement, inputId: string): number {
  return Number((form.querySelector(`#${inputId}`) as HTMLInputElement).value);
}

function getCoordinates(
  form: HTMLFormElement,
  type: 'canvas' | 'image'
): { point1: Point2; point2: Point2; point3: Point2 } {
  const point1: Point2 = [
    getInputValue(form, `${typeToStartIdMap[type]}-1`),
    getInputValue(form, `${typeToStartIdMap[type]}-2`),
  ];

  const point2: Point2 = [
    getInputValue(form, `${typeToEndIdMap[type]}-1`),
    getInputValue(form, `${typeToEndIdMap[type]}-2`),
  ];

  const point3: Point2 = [
    getInputValue(form, `${type}-mid-1`),
    getInputValue(form, `${type}-mid-2`),
  ];

  return { point1, point2, point3 };
}

function createFormElement(): HTMLFormElement {
  const form = document.createElement('form');
  form.style.marginBottom = '10px';

  ['canvas', 'image'].forEach((coordType) => {
    form.innerHTML += `
      <label style="margin-right: 20px;">${
        coordType.charAt(0).toUpperCase() + coordType.slice(1)
      } Coords: Point 1 [${coordType === 'canvas' ? 'x, y' : 'i, j'}]:</label>
      <input style="width:40px" type="number" id="${coordType}-start-1" placeholder="${
      coordType === 'canvas' ? 'x' : 'i'
    }" value="10">
      <input style="width:40px" type="number" id="${coordType}-start-2" placeholder="${
      coordType === 'canvas' ? 'y' : 'j'
    }" value="10">
      <label style="margin-left: 52px; margin-right: 21px;">Point 2 [${
        coordType === 'canvas' ? 'x, y' : 'i, j'
      }]:</label>
      <input style="width:40px" type="number" id="${coordType}-mid-1" placeholder="${
      coordType === 'canvas' ? 'x' : 'i'
    }" value="100">
      <input style="width:40px" type="number" id="${coordType}-mid-2" placeholder="${
      coordType === 'canvas' ? 'y' : 'j'
    }" value="100">
      <label style="margin-left: 52px; margin-right: 21px;">Point 3 [${
        coordType === 'canvas' ? 'x, y' : 'i, j'
      }]:</label>
      <input style="width:40px" type="number" id="${coordType}-end-1" placeholder="${
      coordType === 'canvas' ? 'x' : 'i'
    }" value="100">
      <input style="width:40px" type="number" id="${coordType}-end-2" placeholder="${
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

      const worldPoint1 =
        type === 'image'
          ? utilities.imageToWorldCoords(
              imageId || currentImageId,
              coords.point1
            )
          : viewport.canvasToWorld(coords.point1);

      const worldPoint2 =
        type === 'image'
          ? utilities.imageToWorldCoords(
              imageId || currentImageId,
              coords.point2
            )
          : viewport.canvasToWorld(coords.point2);

      const worldPoint3 =
        type === 'image'
          ? utilities.imageToWorldCoords(
              imageId || currentImageId,
              coords.point3
            )
          : viewport.canvasToWorld(coords.point3);

      AngleTool.hydrate(viewport.id, [worldPoint1, worldPoint2, worldPoint3]);
    });
  });
}

export function createAngleToolUI(): HTMLFormElement {
  const form = createFormElement();
  addButtonListeners(form);
  return form;
}
