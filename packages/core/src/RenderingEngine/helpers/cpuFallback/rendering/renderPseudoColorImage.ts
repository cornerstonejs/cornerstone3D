import setToPixelCoordinateSystem from './setToPixelCoordinateSystem';
import now from './now';
import initializeRenderCanvas from './initializeRenderCanvas';
import getLut from './getLut';
import saveLastRendered from './saveLastRendered';
import doesImageNeedToBeRendered from './doesImageNeedToBeRendered';
import storedPixelDataToCanvasImageDataPseudocolorLUT from './storedPixelDataToCanvasImageDataPseudocolorLUT';
import storedPixelDataToCanvasImageDataPseudocolorLUTPET from './storedPixelDataToCanvasImageDataPseudocolorLUTPET';
import * as colors from '../colors/index';
import computeAutoVoi from './computeAutoVoi';
import VOILUTFunctionType from '../../../../enums/VOILUTFunctionType';
import { getValidVOILUTFunction } from '../../../../utilities/voiLUTFunction';
import type {
  ColormapPublic,
  IImage,
  CPUFallbackEnabledElement,
  CPUFallbackViewport,
} from '../../../../types';
import { clamp } from '../../../../utilities/clamp';
import { toLowHighRange } from '../../../../utilities/windowLevel';
import { createCanvas } from '../../getOrCreateCanvas';
import { coreLog } from '../../../../utilities/logger';

const log = coreLog.getLogger('RenderingEngine', 'renderPseudoColorImage');

/**
 * Gets the LUT that maps the stored values to the indices of the colormap.
 *
 * On the GPU a colormap fills the transfer function with its own colors, so it
 * replaces the curve of a VOI LUT Sequence and the curve of a sigmoid (refer to
 * setVOIGPU in StackViewport). The CPU path follows the same rule: it drops
 * the VOI LUT Sequence, and it maps the window with a linear ramp. The sigmoid
 * carries its window in the LINEAR bounds, so LINEAR gives the GPU ramp.
 * LINEAR_EXACT keeps its exact bounds, as on the GPU.
 */
export function getColormapLut(
  image: IImage,
  viewport: CPUFallbackViewport,
  invalidated: boolean
): Uint8ClampedArray {
  const lutViewport = { ...viewport, voiLUT: undefined };
  // Without the sequence, a viewport with no window gets the automatic window.
  computeAutoVoi(lutViewport, image);
  viewport.voi = lutViewport.voi;
  const { voiLUTFunction } = viewport.voi;
  const isSigmoid =
    getValidVOILUTFunction(voiLUTFunction) ===
    VOILUTFunctionType.SAMPLED_SIGMOID;
  lutViewport.voi = {
    ...viewport.voi,
    voiLUTFunction: isSigmoid ? VOILUTFunctionType.LINEAR : voiLUTFunction,
  };

  return getLut(image, lutViewport, invalidated);
}

/**
 * Returns an appropriate canvas to render the Image. If the canvas available in the cache is appropriate
 * it is returned, otherwise adjustments are made. It also sets the color transfer functions.
 *
 * @param {Object} enabledElement The cornerstone enabled element
 * @param {Object} image The image to be rendered
 * @param {Boolean} invalidated Is pixel data valid
 * @returns {HTMLCanvasElement} An appropriate canvas for rendering the image
 * @memberof rendering
 */
function getRenderCanvas(
  enabledElement: CPUFallbackEnabledElement,
  image: IImage,
  invalidated: boolean
): HTMLCanvasElement {
  if (!enabledElement.renderingTools.renderCanvas) {
    enabledElement.renderingTools.renderCanvas = createCanvas(
      null,
      image.width,
      image.height
    ) as unknown as HTMLCanvasElement;
  }

  const renderCanvas = enabledElement.renderingTools.renderCanvas;

  let colormap =
    enabledElement.viewport.colormap || enabledElement.options.colormap;

  if (enabledElement.options && enabledElement.options.colormap) {
    log.warn(
      'enabledElement.options.colormap is deprecated. Use enabledElement.viewport.colormap instead'
    );
  }
  if (colormap && typeof colormap === 'string') {
    colormap = colors.resolveCPUFallbackColormap(colormap);
  } else if (
    colormap &&
    typeof colormap === 'object' &&
    typeof colormap.getId !== 'function'
  ) {
    colormap = colors.resolveCPUFallbackColormap(colormap as ColormapPublic);
  }

  if (!colormap) {
    throw new Error('renderPseudoColorImage: colormap not found.');
  }

  const colormapId = colormap.getId();

  if (
    !doesImageNeedToBeRendered(enabledElement, image) &&
    !invalidated &&
    enabledElement.renderingTools.colormapId === colormapId
  ) {
    return renderCanvas;
  }

  // If our render canvas does not match the size of this image reset it
  // NOTE: This might be inefficient if we are updating multiple images of different
  // Sizes frequently.
  if (
    !enabledElement.renderingTools.renderCanvasContext ||
    renderCanvas.width !== image.width ||
    renderCanvas.height !== image.height
  ) {
    initializeRenderCanvas(enabledElement, image);
  }

  // Get the lut to use
  let start = now();

  if (
    !enabledElement.renderingTools.colorLUT ||
    invalidated ||
    enabledElement.renderingTools.colormapId !== colormapId
  ) {
    colormap.setNumberOfColors(256);
    enabledElement.renderingTools.colorLUT = colormap.createLookupTable();
    enabledElement.renderingTools.colormapId = colormapId;
  }

  const renderCanvasData = enabledElement.renderingTools.renderCanvasData;
  const renderCanvasContext = enabledElement.renderingTools.renderCanvasContext;
  const { viewport } = enabledElement;
  const colorLUT = enabledElement.renderingTools.colorLUT;

  if (viewport.modality === 'PT') {
    const { windowWidth, windowCenter, voiLUTFunction } = viewport.voi;
    // A linear ramp over the window bounds, as on the GPU (see getColormapLut).
    const { lower: minimum, upper: maximum } = toLowHighRange(
      windowWidth,
      windowCenter,
      voiLUTFunction
    );
    const range = maximum - minimum;
    const collectedMultiplierTerms = 255.0 / range;
    // A LINEAR window of width 1 has no range: a threshold, as in getVOILut.
    const ramp =
      range > 0
        ? (value) => (value - minimum) * collectedMultiplierTerms
        : (value) => (value > minimum ? 255 : 0);

    let petVOILutFunction;

    if (viewport.invert) {
      petVOILutFunction = (value) => {
        return clamp(Math.floor(255 - ramp(value)), 0, 255);
      };
    } else {
      petVOILutFunction = (value) => {
        return clamp(Math.floor(ramp(value)), 0, 255);
      };
    }

    storedPixelDataToCanvasImageDataPseudocolorLUTPET(
      image,
      petVOILutFunction,
      colorLUT,
      renderCanvasData.data
    );
  } else {
    const lut = getColormapLut(image, viewport, invalidated);

    image.stats = image.stats || {};
    image.stats.lastLutGenerateTime = now() - start;

    storedPixelDataToCanvasImageDataPseudocolorLUT(
      image,
      lut,
      colorLUT,
      renderCanvasData.data
    );
  }

  start = now();
  renderCanvasContext.putImageData(renderCanvasData, 0, 0);
  image.stats.lastPutImageDataTime = now() - start;

  return renderCanvas;
}

/**
 * API function to draw a pseudo-color image to a given enabledElement
 *
 * @param {EnabledElement} enabledElement The Cornerstone Enabled Element to redraw
 * @param {Boolean} invalidated - true if pixel data has been invalidated and cached rendering should not be used
 * @returns {void}
 * @memberof rendering
 */
export function renderPseudoColorImage(
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
  if (enabledElement.options?.transparentBackground) {
    context.clearRect(
      0,
      0,
      enabledElement.canvas.width,
      enabledElement.canvas.height
    );
  } else {
    context.fillStyle = 'black';
    context.fillRect(
      0,
      0,
      enabledElement.canvas.width,
      enabledElement.canvas.height
    );
  }

  // Turn off image smooth/interpolation if pixelReplication is set in the viewport
  context.imageSmoothingEnabled = !enabledElement.viewport.pixelReplication;

  // Save the canvas context state and apply the viewport properties
  setToPixelCoordinateSystem(enabledElement, context);

  // If no options are set we will retrieve the renderCanvas through the
  // Normal Canvas rendering path
  // TODO: Add WebGL support for pseudocolor pipeline
  const renderCanvas = getRenderCanvas(enabledElement, image, invalidated);

  const sx = enabledElement.viewport.displayedArea.tlhc.x - 1;
  const sy = enabledElement.viewport.displayedArea.tlhc.y - 1;
  const width = enabledElement.viewport.displayedArea.brhc.x - sx;
  const height = enabledElement.viewport.displayedArea.brhc.y - sy;

  context.drawImage(renderCanvas, sx, sy, width, height, 0, 0, width, height);

  enabledElement.renderingTools = saveLastRendered(enabledElement);
}
