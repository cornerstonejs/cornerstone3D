import storedPixelDataToCanvasImageData from './storedPixelDataToCanvasImageData';
import storedPixelDataToCanvasImageDataPET from './storedPixelDataToCanvasImageDataPET';
import storedPixelDataToCanvasImageDataRGBA from './storedPixelDataToCanvasImageDataRGBA';
import setToPixelCoordinateSystem from './setToPixelCoordinateSystem';
import now from './now';
import getLut from './getLut';
import doesImageNeedToBeRendered from './doesImageNeedToBeRendered';
import initializeRenderCanvas from './initializeRenderCanvas';
import saveLastRendered from './saveLastRendered';
import { IImage, CPUFallbackEnabledElement } from '../../../../types';

/**
 * Returns an appropriate canvas to render the Image. If the canvas available in the cache is appropriate
 * it is returned, otherwise adjustments are made. It also sets the color transfer functions.
 *
 * @param {Object} enabledElement The cornerstone enabled element
 * @param {Object} image The image to be rendered
 * @param {Boolean} invalidated Is pixel data valid
 * @param {Boolean} [useAlphaChannel = true] Will an alpha channel be used
 * @returns {HTMLCanvasElement} An appropriate canvas for rendering the image
 * @memberof rendering
 */
function getRenderCanvas(
  enabledElement: CPUFallbackEnabledElement,
  image: IImage,
  invalidated: boolean,
  useAlphaChannel = true
): HTMLCanvasElement {
  const canvasWasColor =
    enabledElement.renderingTools.lastRenderedIsColor === true;

  if (!enabledElement.renderingTools.renderCanvas || canvasWasColor) {
    enabledElement.renderingTools.renderCanvas =
      document.createElement('canvas');
    initializeRenderCanvas(enabledElement, image);
  }

  const renderCanvas = enabledElement.renderingTools.renderCanvas;

  if (
    doesImageNeedToBeRendered(enabledElement, image) === false &&
    invalidated !== true
  ) {
    return renderCanvas;
  }

  // If our render canvas does not match the size of this image reset it
  // NOTE: This might be inefficient if we are updating multiple images of different
  // Sizes frequently.
  if (
    renderCanvas.width !== image.width ||
    renderCanvas.height !== image.height
  ) {
    initializeRenderCanvas(enabledElement, image);
  }

  image.stats = image.stats || {};

  const renderCanvasData = enabledElement.renderingTools.renderCanvasData;
  const renderCanvasContext = enabledElement.renderingTools.renderCanvasContext;

  let start = now();
  image.stats.lastLutGenerateTime = now() - start;

  const { viewport } = enabledElement;

  // If modality is 'PT' and the image is scaled then the results are floating points,
  // and we cannot create a lut for it (cannot have float indices). Therefore,
  // we use a mapping function to get the voiLUT from the values by applying
  // the windowLevel and windowWidth.
  if (viewport.modality === 'PT' && image.isPreScaled) {
    const { windowWidth, windowCenter } = viewport.voi;
    const minimum = windowCenter - windowWidth / 2;
    const maximum = windowCenter + windowWidth / 2;
    const range = maximum - minimum;
    const collectedMultiplierTerms = 255.0 / range;

    let petVOILutFunction;

    if (viewport.invert) {
      petVOILutFunction = (value) =>
        255 - (value - minimum) * collectedMultiplierTerms;
    } else {
      // Note, don't need to math.floor, that is dealt with by setting the value in the Uint8Array.
      petVOILutFunction = (value) =>
        (value - minimum) * collectedMultiplierTerms;
    }

    storedPixelDataToCanvasImageDataPET(
      image,
      petVOILutFunction,
      renderCanvasData.data
    );
  } else {
    // Get the lut to use
    const lut = getLut(image, viewport, invalidated);

    if (useAlphaChannel) {
      storedPixelDataToCanvasImageData(image, lut, renderCanvasData.data);
    } else {
      storedPixelDataToCanvasImageDataRGBA(image, lut, renderCanvasData.data);
    }
  }

  start = now();
  renderCanvasContext.putImageData(renderCanvasData, 0, 0);
  image.stats.lastPutImageDataTime = now() - start;

  return renderCanvas;
}

/**
 * API function to draw a grayscale image to a given enabledElement
 *
 * @param {EnabledElement} enabledElement The Cornerstone Enabled Element to redraw
 * @param {Boolean} invalidated - true if pixel data has been invalidated and cached rendering should not be used
 * @returns {void}
 * @memberof rendering
 */
export function renderGrayscaleImage(
  enabledElement: CPUFallbackEnabledElement,
  invalidated: boolean
): void {
  if (enabledElement === undefined) {
    throw new Error(
      'drawImage: enabledElement parameter must not be undefined'
    );
  }

  const image = enabledElement.image;

  if (image === undefined) {
    throw new Error('drawImage: image must be loaded before it can be drawn');
  }

  // Get the canvas context and reset the transform
  const context = enabledElement.canvas.getContext('2d');

  context.setTransform(1, 0, 0, 1, 0, 0);

  // Clear the canvas
  context.fillStyle = 'black';
  context.fillRect(
    0,
    0,
    enabledElement.canvas.width,
    enabledElement.canvas.height
  );

  // Turn off image smooth/interpolation if pixelReplication is set in the viewport
  context.imageSmoothingEnabled = !enabledElement.viewport.pixelReplication;

  // Save the canvas context state and apply the viewport properties
  setToPixelCoordinateSystem(enabledElement, context);

  const renderCanvas = getRenderCanvas(enabledElement, image, invalidated);

  const sx = enabledElement.viewport.displayedArea.tlhc.x - 1;
  const sy = enabledElement.viewport.displayedArea.tlhc.y - 1;
  const width = enabledElement.viewport.displayedArea.brhc.x - sx;
  const height = enabledElement.viewport.displayedArea.brhc.y - sy;

  context.drawImage(renderCanvas, sx, sy, width, height, 0, 0, width, height);

  enabledElement.renderingTools = saveLastRendered(enabledElement);
}
