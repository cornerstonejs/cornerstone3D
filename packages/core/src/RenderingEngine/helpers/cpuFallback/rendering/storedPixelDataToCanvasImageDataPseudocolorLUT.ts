import * as colors from '../colors/index';
import now from './now';
import type { IImage, CPUFallbackLookupTable } from '../../../../types';

/**
 *
 * @param {Image} image A Cornerstone Image Object
 * @param {Array} grayscaleLut Lookup table array
 * @param {LookupTable|Array} colorLUT Lookup table array
 * @param {Uint8ClampedArray} canvasImageDataData canvasImageData.data buffer filled with white pixels
 *
 * @returns {void}
 * @memberof Internal
 */
function storedPixelDataToCanvasImageDataPseudocolorLUT(
  image: IImage,
  grayscaleLut: Uint8ClampedArray,
  colorLUT: CPUFallbackLookupTable,
  canvasImageDataData: Uint8ClampedArray
): void {
  let start = now();
  const pixelData = image.getPixelData();

  image.stats.lastGetPixelDataTime = now() - start;

  const numPixels = pixelData.length;
  const minPixelValue = image.minPixelValue;
  let canvasImageDataIndex = 0;
  let storedPixelDataIndex = 0;
  let grayscale;
  let rgba;
  let clut;

  start = now();

  if (colorLUT instanceof colors.LookupTable) {
    clut = colorLUT.Table;
  } else {
    clut = colorLUT;
  }

  if (minPixelValue < 0) {
    while (storedPixelDataIndex < numPixels) {
      grayscale =
        grayscaleLut[pixelData[storedPixelDataIndex++] + -minPixelValue];
      rgba = clut[grayscale];
      canvasImageDataData[canvasImageDataIndex++] = rgba[0];
      canvasImageDataData[canvasImageDataIndex++] = rgba[1];
      canvasImageDataData[canvasImageDataIndex++] = rgba[2];
      canvasImageDataData[canvasImageDataIndex++] = rgba[3];
    }
  } else {
    while (storedPixelDataIndex < numPixels) {
      grayscale = grayscaleLut[pixelData[storedPixelDataIndex++]];
      rgba = clut[grayscale];
      canvasImageDataData[canvasImageDataIndex++] = rgba[0];
      canvasImageDataData[canvasImageDataIndex++] = rgba[1];
      canvasImageDataData[canvasImageDataIndex++] = rgba[2];
      canvasImageDataData[canvasImageDataIndex++] = rgba[3];
    }
  }

  image.stats.lastStoredPixelDataToCanvasImageDataTime = now() - start;
}

export default storedPixelDataToCanvasImageDataPseudocolorLUT;
