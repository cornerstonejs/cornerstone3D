import type { vtkImageData } from '@kitware/vtk.js/Common/DataModel/ImageData';
import { getOrCreateCanvas } from '@cornerstonejs/core';

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

export { createNormalizedMouseEvent };
