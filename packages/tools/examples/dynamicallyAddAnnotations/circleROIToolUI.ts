import { getEnabledElementByViewportId, utilities } from '@cornerstonejs/core';
import type { Point2 } from '@cornerstonejs/core/types';
import { CircleROITool } from '@cornerstonejs/tools';
import { typeToIdMap, typeToStartIdMap, typeToEndIdMap } from './constants';

function getInputValue(form: HTMLFormElement, inputId: string): number {
  return Number((form.querySelector(`#${inputId}`) as HTMLInputElement).value);
}

function getCoordinates(
  form: HTMLFormElement,
  type: 'canvas' | 'image'
): { center: Point2; radiusPoint: Point2 } {
  const center: Point2 = [
    getInputValue(form, `${typeToStartIdMap[type]}-1`),
    getInputValue(form, `${typeToStartIdMap[type]}-2`),
  ];

  const radiusPoint: Point2 = [
    getInputValue(form, `${typeToEndIdMap[type]}-1`),
    getInputValue(form, `${typeToEndIdMap[type]}-2`),
  ];

  return { center, radiusPoint };
}

function createFormElement(): HTMLFormElement {
  const form = document.createElement('form');
  form.style.marginBottom = '10px';

  ['canvas', 'image'].forEach((coordType) => {
    form.innerHTML += `
      <label style="margin-right: 20px;">${
        coordType.charAt(0).toUpperCase() + coordType.slice(1)
      } Coords: Center [${coordType === 'canvas' ? 'x, y' : 'i, j'}]:</label>
      <input style="width:40px" type="number" id="${coordType}-start-1" placeholder="${
      coordType === 'canvas' ? 'x' : 'i'
    }" value="50">
      <input style="width:40px" type="number" id="${coordType}-start-2" placeholder="${
      coordType === 'canvas' ? 'y' : 'j'
    }" value="50">
      <label style="margin-left: 52px; margin-right: 21px;">Radius Point [${
        coordType === 'canvas' ? 'x, y' : 'i, j'
      }]:</label>
      <input style="width:40px" type="number" id="${coordType}-end-1" placeholder="Radius ${
      coordType === 'canvas' ? 'x' : 'i'
    }" value="100">
      <input style="width:40px" type="number" id="${coordType}-end-2" placeholder="Radius ${
      coordType === 'canvas' ? 'y' : 'j'
    }" value="50">
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

      const worldCenter =
        type === 'image'
          ? utilities.imageToWorldCoords(
              imageId || currentImageId,
              coords.center
            )
          : viewport.canvasToWorld(coords.center);

      const worldRadiusPoint =
        type === 'image'
          ? utilities.imageToWorldCoords(
              imageId || currentImageId,
              coords.radiusPoint
            )
          : viewport.canvasToWorld(coords.radiusPoint);

      CircleROITool.hydrate(viewport.id, [worldCenter, worldRadiusPoint], {
        referencedImageId: imageId,
      });
    });
  });
}

export function createCircleROIToolUI(): HTMLFormElement {
  const form = createFormElement();
  addButtonListeners(form);
  return form;
}
