import type { CPUFallbackEnabledElement, IImage } from '../../../../types';

/**
 * Sets size and clears canvas. The image data of white opaque pixels is made,
 * not read back from the canvas, so the render canvas is never read: Chrome
 * warns at the second read of a canvas, and a stack whose images have two
 * sizes sets up the same render canvas again.
 *
 * @param {Object} enabledElement Cornerstone Enabled Element
 * @param {Object} image Image to be rendered
 * @returns {void}
 * @memberof rendering
 */
export default function (
  enabledElement: CPUFallbackEnabledElement,
  image: IImage
): void {
  const renderCanvas = enabledElement.renderingTools.renderCanvas;

  // Resize the canvas
  renderCanvas.width = image.width;
  renderCanvas.height = image.height;

  const canvasContext = renderCanvas.getContext('2d');

  // NOTE - we need to fill the render canvas with white pixels since we
  // control the luminance using the alpha channel to improve rendering performance.
  canvasContext.fillStyle = 'white';
  canvasContext.fillRect(0, 0, renderCanvas.width, renderCanvas.height);

  const renderCanvasData = canvasContext.createImageData(
    image.width,
    image.height
  );

  renderCanvasData.data.fill(255);

  enabledElement.renderingTools.renderCanvasContext = canvasContext;
  enabledElement.renderingTools.renderCanvasData = renderCanvasData;
}
