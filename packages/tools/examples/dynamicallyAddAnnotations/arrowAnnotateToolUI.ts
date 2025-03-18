import { getEnabledElementByViewportId, utilities } from '@cornerstonejs/core';
import type { Point2 } from '@cornerstonejs/core/types';
import { ArrowAnnotateTool } from '@cornerstonejs/tools';
import { typeToIdMap, typeToStartIdMap, typeToEndIdMap } from './constants';

function getInputValue(form: HTMLFormElement, inputId: string): number {
  return Number((form.querySelector(`#${inputId}`) as HTMLInputElement).value);
}

function getCoordinates(
  form: HTMLFormElement,
  type: 'canvas' | 'image'
): { point1: Point2; point2: Point2 } {
  const point1: Point2 = [
    getInputValue(form, `${typeToStartIdMap[type]}-1`),
    getInputValue(form, `${typeToStartIdMap[type]}-2`),
  ];

  const point2: Point2 = [
    getInputValue(form, `${typeToEndIdMap[type]}-1`),
    getInputValue(form, `${typeToEndIdMap[type]}-2`),
  ];

  return { point1, point2 };
}

function createFormElement(): HTMLFormElement {
  const form = document.createElement('form');
  form.style.marginBottom = '10px';

  ['canvas', 'image'].forEach((coordType) => {
    form.innerHTML += `
      <label style="margin-right: 20px;">${
        coordType.charAt(0).toUpperCase() + coordType.slice(1)
      } Coords: Start [${coordType === 'canvas' ? 'x, y' : 'i, j'}]:</label>
      <input style="width:40px" type="number" id="${coordType}-start-1" placeholder="${
      coordType === 'canvas' ? 'x' : 'i'
    }" value="10">
      <input style="width:40px" type="number" id="${coordType}-start-2" placeholder="${
      coordType === 'canvas' ? 'y' : 'j'
    }" value="10">
      <label style="margin-left: 52px; margin-right: 21px;">End [${
        coordType === 'canvas' ? 'x, y' : 'i, j'
      }]:</label>
      <input style="width:40px" type="number" id="${coordType}-end-1" placeholder="End ${
      coordType === 'canvas' ? 'x' : 'i'
    }" value="100">
      <input style="width:40px" type="number" id="${coordType}-end-2" placeholder="End ${
      coordType === 'canvas' ? 'y' : 'j'
    }" value="100">
      <label style="margin-left: 52px; margin-right: 21px;">Text:</label>
      <input style="width:100px" type="text" id="${coordType}-text" placeholder="My Annotation" value="">
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
      const textInput = form.querySelector(`#${type}-text`) as HTMLInputElement;
      const text = textInput ? textInput.value : '';

      const currentImageId = viewport.getCurrentImageId() as string;

      const point1 =
        type === 'image'
          ? utilities.imageToWorldCoords(
              imageId || currentImageId,
              coords.point1
            )
          : viewport.canvasToWorld(coords.point1);

      const point2 =
        type === 'image'
          ? utilities.imageToWorldCoords(
              imageId || currentImageId,
              coords.point2
            )
          : viewport.canvasToWorld(coords.point2);

      ArrowAnnotateTool.hydrate(viewport.id, [point1, point2], text);
    });
  });
}

export function createArrowAnnotateToolUI(): HTMLFormElement {
  const form = createFormElement();
  addButtonListeners(form);
  return form;
}
