import fitToWindow from './fitToWindow';
import getImageSize from './getImageSize';
import { CPUFallbackEnabledElement } from '../../../../types';

/**
 * This module is responsible for enabling an element to display images with cornerstone
 *
 * @param {HTMLDivElement} element The DOM element enabled for Cornerstone
 * @param {HTMLDivElement} canvas The Canvas DOM element within the DOM element enabled for Cornerstone
 * @returns {void}
 */
function setCanvasSize(enabledElement: CPUFallbackEnabledElement) {
  const { canvas } = enabledElement;
  const { clientWidth, clientHeight } = canvas;

  // Set the canvas to be same resolution as the client.
  if (canvas.width !== clientWidth || canvas.height !== clientHeight) {
    canvas.width = clientWidth;
    canvas.height = clientHeight;
  }
}

/**
 * Checks if the image of a given enabled element fitted the window
 * before the resize
 *
 * @param {EnabledElement} enabledElement The Cornerstone Enabled Element
 * @param {number} oldCanvasWidth The width of the canvas before the resize
 * @param {number} oldCanvasHeight The height of the canvas before the resize
 * @return {Boolean} true if it fitted the windows, false otherwise
 */
function wasFitToWindow(
  enabledElement: CPUFallbackEnabledElement,
  oldCanvasWidth: number,
  oldCanvasHeight: number
): boolean {
  const scale = enabledElement.viewport.scale;
  const imageSize = getImageSize(
    enabledElement.image,
    enabledElement.viewport.rotation
  );
  const imageWidth = Math.round(imageSize.width * scale);
  const imageHeight = Math.round(imageSize.height * scale);
  const x = enabledElement.viewport.translation.x;
  const y = enabledElement.viewport.translation.y;

  return (
    (imageWidth === oldCanvasWidth && imageHeight <= oldCanvasHeight) ||
    (imageWidth <= oldCanvasWidth &&
      imageHeight === oldCanvasHeight &&
      x === 0 &&
      y === 0)
  );
}

/**
 * Rescale the image relative to the changed size of the canvas
 *
 * @param {EnabledElement} enabledElement The Cornerstone Enabled Element
 * @param {number} oldCanvasWidth The width of the canvas before the resize
 * @param {number} oldCanvasHeight The height of the canvas before the resize
 * @return {void}
 */
function relativeRescale(
  enabledElement: CPUFallbackEnabledElement,
  oldCanvasWidth: number,
  oldCanvasHeight: number
): void {
  const scale = enabledElement.viewport.scale;
  const canvasWidth = enabledElement.canvas.width;
  const canvasHeight = enabledElement.canvas.height;
  const relWidthChange = canvasWidth / oldCanvasWidth;
  const relHeightChange = canvasHeight / oldCanvasHeight;
  const relChange = Math.sqrt(relWidthChange * relHeightChange);

  enabledElement.viewport.scale = relChange * scale;
}

/**
 * Resizes an enabled element and optionally fits the image to window
 *
 * @param {HTMLDivElement} element The DOM element enabled for Cornerstone
 * @param {Boolean} forceFitToWindow true to to force a refit, false to rescale accordingly
 * @returns {void}
 */
export default function (
  enabledElement: CPUFallbackEnabledElement,
  forceFitToWindow = false
): void {
  const oldCanvasWidth = enabledElement.canvas.width;
  const oldCanvasHeight = enabledElement.canvas.height;

  setCanvasSize(enabledElement);

  if (enabledElement.image === undefined) {
    return;
  }

  if (
    forceFitToWindow ||
    wasFitToWindow(enabledElement, oldCanvasWidth, oldCanvasHeight)
  ) {
    // Fit the image to the window again if it fitted before the resize
    fitToWindow(enabledElement);
  } else {
    // Adapt the scale of a zoomed or panned image relative to the size change
    relativeRescale(enabledElement, oldCanvasWidth, oldCanvasHeight);
  }
}
