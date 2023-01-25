import type { vtkImageData } from '@kitware/vtk.js/Common/DataModel/ImageData';
import { getOrCreateCanvas } from '@cornerstonejs/core';
import * as cornerstoneTools from '@cornerstonejs/tools';

const { Events } = cornerstoneTools.Enums;

function canvasPointsToPagePoints(DomCanvasElement, canvasPoint) {
  const rect = DomCanvasElement.getBoundingClientRect();
  return [
    canvasPoint[0] + rect.left + window.pageXOffset,
    canvasPoint[1] + rect.top + window.pageYOffset,
  ];
}

/**
 * This function uses the imageData being displayed on the viewport (the default image) and
 * an index (IJK) on the image to normalize the mouse event details.
 * It should be noted that the normalization is required since client and page XY
 * cannot accept a float. Therefore, for the requested index, canvas coordinate
 * will get calculated and normalized (rounded) to enable normalized client/page XY
 *
 * @param {vtkImageData} imageData
 * @param {[number, number,number]} index - IJK index of the point to click
 * @param {HTMLDivElement} element - the canvas to be clicked on
 * @param {IStackViewport|IVolumeViewport} viewport
 * @returns pageX, pageY, clientX, clientY, worldCoordinate
 */
function createNormalizedMouseEvent(
  imageData: vtkImageData,
  index,
  element,
  viewport
) {
  const canvas = getOrCreateCanvas(element);
  const tempWorld1 = imageData.indexToWorld(index);
  const tempCanvasPoint1 = viewport.worldToCanvas(tempWorld1);
  const canvasPoint1 = tempCanvasPoint1.map((p) => Math.round(p));
  const [pageX, pageY] = canvasPointsToPagePoints(canvas, canvasPoint1);
  const worldCoord = viewport.canvasToWorld(canvasPoint1);

  return {
    pageX,
    pageY,
    clientX: pageX,
    clientY: pageY,
    worldCoord,
  };
}

/**
 * Asynchronously dispatches a mouse down followed by a mouse up on the given element.
 * Since mouse down events are performed on a timeout to detect potential
 * double clicks, the mouse up event is not triggered until the mouse down
 * event has been processed. An optional callback is invoked after the mouse
 * down is triggered but before the mouse up. An optional callback is invoked
 * after the mouse up has fired.
 *
 * @param element the element to dispatch to
 * @param mouseDownEvent the mouse down event to dispatch
 * @param mouseUpEvent the mouse up event to dispatch
 * @param betweenDownAndUpCallback optional callback between the down and up
 * @param afterDownAndUpCallback optional callback after the up
 * @returns a Promise for the eventual completion of the mouse down and up
 */
function performMouseDownAndUp(
  element: HTMLElement,
  mouseDownEvent: MouseEvent,
  mouseUpEvent: MouseEvent,
  betweenDownAndUpCallback: () => unknown = null,
  afterDownAndUpCallback: () => unknown = null
): Promise<void> {
  return new Promise<void>((resolve) => {
    const mouseDownListener = function () {
      element.removeEventListener(Events.MOUSE_DOWN, mouseDownListener);

      if (betweenDownAndUpCallback) {
        betweenDownAndUpCallback();
      }

      document.dispatchEvent(mouseUpEvent);
    };

    element.addEventListener(Events.MOUSE_DOWN, mouseDownListener);

    const mouseUpListener = function () {
      element.removeEventListener(Events.MOUSE_UP, mouseUpListener);
      element.removeEventListener(Events.MOUSE_CLICK, mouseUpListener);

      if (afterDownAndUpCallback) {
        afterDownAndUpCallback();
      }
      resolve();
    };

    // It could be a click or an up.
    element.addEventListener(Events.MOUSE_UP, mouseUpListener);
    element.addEventListener(Events.MOUSE_CLICK, mouseUpListener);

    element.dispatchEvent(mouseDownEvent);
  });
}

export { createNormalizedMouseEvent, performMouseDownAndUp };
